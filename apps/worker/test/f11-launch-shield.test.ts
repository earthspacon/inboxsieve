import { SECURITY_HEADERS } from "@inboxsieve/contract";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { API_ROUTES } from "../src/app";
import { createAuth } from "../src/auth";
import { admitLead } from "../src/leads/pipeline";
import { runQueues } from "../src/leads/jobs";
import { createLogMailer } from "../src/mailer";
import { consumeRateLimit } from "../src/repo/shield";
import { MAGIC_LINK_LIMITS } from "../src/shield/auth-guard";
import { addSeatByHand, buildLeadInput, buildTestDeps, countRows, createMockAnalyzer, db, seedSource, uniqueEmail } from "./helpers";
import { BASE, followMagicLink, readMagicLink, readSessionCookie, requestMagicLink, signIn, signInTrial } from "./session";
import { siteverifyRequests } from "./turnstile";

const ONE_DAY_MS = 24 * 60 * 60_000;

async function countOutbox(email: string) {
  return countRows({ sql: "SELECT COUNT(*) AS n FROM dev_outbox WHERE to_address = ?", binds: [email] });
}

async function call({
  cookie,
  path,
  method = "GET",
  body,
  headers = {},
}: {
  cookie?: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      origin: BASE,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function uniqueIp() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

async function addLead({ brandId, sourceId, message }: { brandId: string; sourceId: string; message: string }) {
  const result = await admitLead({
    db,
    brandId,
    sourceId,
    dedupeKey: null,
    parsed: { ok: true, lead: buildLeadInput({ message }) },
    raw: "raw",
    authResults: null,
    now: new Date(),
  });
  return result.leadId;
}

async function readLeadStatus(leadId: string) {
  const row = await db.prepare("SELECT status FROM leads WHERE id = ?").bind(leadId).first<{ status: string }>();
  return row?.status;
}

describe("Abuse shield: sign-in", () => {
  it("Shield: a failed Turnstile check returns 403 and sends no sign-in mail", async () => {
    const email = uniqueEmail("bot");

    const response = await requestMagicLink(email, { turnstileToken: "forged-token" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "captcha_failed" });
    expect(siteverifyRequests.at(-1)?.response).toBe("forged-token");
    expect(await countOutbox(email)).toBe(0);
  });

  it("Shield: a request without a Turnstile token returns 403 and sends no mail", async () => {
    const email = uniqueEmail("no-token");

    const response = await requestMagicLink(email, { turnstileToken: "" });

    expect(response.status).toBe(403);
    expect(await countOutbox(email)).toBe(0);
  });

  it("Shield: the 4th magic link for one email within 15 minutes gets 429 and no 4th mail", async () => {
    const email = uniqueEmail("flood");

    const statuses = [];
    for (let attempt = 0; attempt < MAGIC_LINK_LIMITS.perEmail.limit + 1; attempt += 1) {
      statuses.push((await requestMagicLink(email)).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(await countOutbox(email)).toBe(3);
  });

  it("Shield: the per-email window reopens after 15 minutes", async () => {
    const email = uniqueEmail("window");
    for (let attempt = 0; attempt < MAGIC_LINK_LIMITS.perEmail.limit; attempt += 1) {
      await requestMagicLink(email);
    }
    await db
      .prepare("UPDATE rate_limit_hits SET hit_at = ? WHERE key LIKE 'magic-link:email:%'")
      .bind(new Date(Date.now() - MAGIC_LINK_LIMITS.perEmail.windowMs - 1000).toISOString())
      .run();

    expect((await requestMagicLink(email)).status).toBe(200);
  });

  it("Shield: the 11th magic link from one IP within an hour gets 429", async () => {
    const ip = uniqueIp();

    const statuses = [];
    for (let attempt = 0; attempt < MAGIC_LINK_LIMITS.perIp.limit + 1; attempt += 1) {
      statuses.push((await requestMagicLink(uniqueEmail("ip"), { ip })).status);
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
  });

  it("Shield: rate-limit keys store hashes, not the email or the IP", async () => {
    const email = uniqueEmail("hashed");
    const ip = uniqueIp();

    await requestMagicLink(email, { ip });

    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM rate_limit_hits WHERE key LIKE ? OR key LIKE ?",
        binds: [`%${email}%`, `%${ip}%`],
      }),
    ).toBe(0);
  });

  it("Shield: a disposable email domain gets 400 with a clear message and no mail", async () => {
    const email = `someone-${crypto.randomUUID().slice(0, 6)}@mailinator.com`;
    const subdomain = `someone@inbox.mailinator.com`;

    const response = await requestMagicLink(email);
    const viaSubdomain = await requestMagicLink(subdomain);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "disposable_email",
      message: "Temporary email addresses can't be used. Sign in with your work email instead",
    });
    expect(viaSubdomain.status).toBe(400);
    expect(await countOutbox(email)).toBe(0);
  });

  it("Shield: auth writes from one IP are limited per minute by the rate-limit binding", async () => {
    const ip = uniqueIp();

    const statuses = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await call({
        path: "/api/auth/sign-out",
        method: "POST",
        body: {},
        headers: { "cf-connecting-ip": ip },
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 30)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });

  it("Shield: parallel hits on one rate-limit key never pass more than the limit", async () => {
    const key = `parallel:${uniqueEmail("race")}`;
    const now = new Date();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumeRateLimit({ db, key, limit: 3, windowMs: 60_000, now })),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

describe("Abuse shield: webhook ingest", () => {
  it("Shield: one webhook source takes 120 submissions a minute, the 121st gets 429", async () => {
    const owner = await signInTrial({ email: uniqueEmail("hook-flood") });
    const source = await seedSource({ brandId: owner.brandId, kind: "webhook" });
    // The limiter's 60 s windows are aligned to the wall clock; start early in one so all 121 requests share it.
    const msIntoWindow = Date.now() % 60_000;
    if (msIntoWindow > 30_000) {
      await new Promise((resolve) => {
        setTimeout(resolve, 60_000 - msIntoWindow + 100);
      });
    }

    const statuses = [];
    for (let attempt = 0; attempt < 121; attempt += 1) {
      const response = await SELF.fetch(`${BASE}/h/${source.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "lead@buyer.example", message: `Inquiry ${attempt}` }),
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 120).every((status) => status === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  }, 120_000);
});

describe("Abuse shield: daily LLM budget", () => {
  it("Shield: over the global daily cap a lead stays queued, the LLM is not called and the owner gets one email", async () => {
    const now = new Date("2031-03-01T12:00:00.000Z");
    const owner = await signInTrial({ email: uniqueEmail("cap") });
    const source = await seedSource({ brandId: owner.brandId, kind: "webhook" });
    const leadId = await addLead({ brandId: owner.brandId, sourceId: source.id, message: "Budget cap lead" });
    await db
      .prepare("INSERT INTO llm_spend (day, account_id, usd) VALUES (?, 'someone-else', ?)")
      .bind("2031-03-01", Number(env.LLM_DAILY_USD_CAP))
      .run();
    const mock = createMockAnalyzer();
    const { deps } = buildTestDeps({ analyzer: mock.analyzer, now: () => now });

    await runQueues(deps);
    await runQueues(deps);

    expect(mock.calls).toHaveLength(0);
    expect(await readLeadStatus(leadId)).toBe("queued");
    expect(await countOutbox(env.OWNER_ALERT_EMAIL)).toBe(1);

    const nextDay = buildTestDeps({ analyzer: mock.analyzer, now: () => new Date(now.getTime() + ONE_DAY_MS) });
    await runQueues(nextDay.deps);

    expect(await readLeadStatus(leadId)).toBe("analyzed");
  });

  it("Shield: an account over its own daily cap waits while other accounts are still analyzed", async () => {
    const now = new Date("2031-04-01T12:00:00.000Z");
    const heavy = await signInTrial({ email: uniqueEmail("heavy") });
    const light = await signInTrial({ email: uniqueEmail("light") });
    const heavySource = await seedSource({ brandId: heavy.brandId, kind: "webhook" });
    const lightSource = await seedSource({ brandId: light.brandId, kind: "webhook" });
    const heavyLead = await addLead({
      brandId: heavy.brandId,
      sourceId: heavySource.id,
      message: "Heavy account lead",
    });
    const lightLead = await addLead({
      brandId: light.brandId,
      sourceId: lightSource.id,
      message: "Light account lead",
    });
    await db
      .prepare("INSERT INTO llm_spend (day, account_id, usd) VALUES (?, ?, ?)")
      .bind("2031-04-01", heavy.accountId, Number(env.LLM_ACCOUNT_DAILY_USD_CAP))
      .run();
    const mock = createMockAnalyzer();

    await runQueues(buildTestDeps({ analyzer: mock.analyzer, now: () => now }).deps);

    expect(mock.calls.map((request) => request.lead.message)).not.toContain("Heavy account lead");
    expect(await readLeadStatus(heavyLead)).toBe("queued");
    expect(await readLeadStatus(lightLead)).toBe("analyzed");
  });

  it("Shield: every analysis adds its cost to the account's spend for the day", async () => {
    const now = new Date("2031-05-01T12:00:00.000Z");
    const owner = await signInTrial({ email: uniqueEmail("spend") });
    const source = await seedSource({ brandId: owner.brandId, kind: "webhook" });
    await addLead({ brandId: owner.brandId, sourceId: source.id, message: "Spend lead" });
    const mock = createMockAnalyzer(undefined, { costUsd: 0.0004 });

    await runQueues(buildTestDeps({ analyzer: mock.analyzer, now: () => now }).deps);
    const row = await db
      .prepare("SELECT usd FROM llm_spend WHERE day = '2031-05-01' AND account_id = ?")
      .bind(owner.accountId)
      .first<{ usd: number }>();

    expect(row?.usd).toBeCloseTo(0.0004 * mock.calls.filter((r) => r.lead.message === "Spend lead").length, 8);
  });
});

describe("Security review", () => {
  it("Security: every /api route with an id returns 404 for another account's id", async () => {
    const attacker = await signInTrial({ email: uniqueEmail("attacker") });
    const victim = await signInTrial({ email: uniqueEmail("victim") });
    const source = await seedSource({ brandId: victim.brandId, kind: "webhook" });
    const leadId = await addLead({ brandId: victim.brandId, sourceId: source.id, message: "Victim lead" });
    await addSeatByHand({ accountId: victim.accountId, email: uniqueEmail("vm") });
    const seat = await db
      .prepare("SELECT id FROM seats WHERE account_id = ? AND role = 'member'")
      .bind(victim.accountId)
      .first<{ id: string }>();
    const ids: Record<string, string> = {
      brandId: victim.brandId,
      leadId,
      sourceId: source.id,
      seatId: seat?.id ?? "",
    };
    const routes = API_ROUTES.filter((route) => route.pattern.pathname.includes(":"));

    const results = [];
    for (const route of routes) {
      const path = route.pattern.pathname.replace(/:(\w+)/g, (_, name: string) => ids[name]);
      const body = route.method === "GET" ? undefined : {};
      const response = await call({ cookie: attacker.cookie, path, method: route.method, body });
      results.push(`${route.method} ${route.pattern.pathname} ${response.status}`);
    }
    const victimLead = await db.prepare("SELECT stage, draft FROM leads WHERE id = ?").bind(leadId).first();

    expect(routes.length).toBeGreaterThanOrEqual(20);
    expect(results.filter((line) => !line.endsWith(" 404"))).toEqual([]);
    expect(victimLead).toMatchObject({ stage: "new" });
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM brands WHERE id = ?", binds: [victim.brandId] })).toBe(1);
  });

  it("Security: a member gets 403 on every owner-only action and nothing changes", async () => {
    const owner = await signInTrial({ email: uniqueEmail("seat-owner") });
    const memberEmail = uniqueEmail("seat-member");
    await addSeatByHand({ accountId: owner.accountId, email: memberEmail });
    const member = await signIn(memberEmail);
    const ownerSeat = await db
      .prepare("SELECT id FROM seats WHERE account_id = ? AND role = 'owner'")
      .bind(owner.accountId)
      .first<{ id: string }>();
    const ownerOnly = [
      { method: "POST", path: "/api/seats", body: { email: uniqueEmail("x") } },
      { method: "DELETE", path: `/api/seats/${ownerSeat?.id}` },
      { method: "DELETE", path: `/api/brands/${owner.brandId}`, body: { confirm: "Acme Studio" } },
      { method: "DELETE", path: "/api/account", body: { confirm: "DELETE" } },
      { method: "POST", path: "/api/billing/trial" },
      { method: "POST", path: "/api/billing/portal" },
    ];

    const statuses = [];
    for (const action of ownerOnly) {
      statuses.push((await call({ cookie: member, ...action })).status);
    }

    expect(statuses).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM brands WHERE id = ?", binds: [owner.brandId] })).toBe(1);
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM accounts WHERE id = ? AND deletion_requested_at IS NULL",
        binds: [owner.accountId],
      }),
    ).toBe(1);
  });

  it("Security: the CSV export escapes cells starting with = + - @", async () => {
    const owner = await signInTrial({ email: uniqueEmail("csv-escape") });
    const source = await seedSource({ brandId: owner.brandId, kind: "webhook" });
    for (const message of ["=1+1", "+cmd", "-2+3", "@SUM(A1)"]) {
      await addLead({ brandId: owner.brandId, sourceId: source.id, message });
    }

    const csv = await (await call({ cookie: owner.cookie, path: `/api/brands/${owner.brandId}/export.csv` })).text();

    expect(csv).toContain(",'=1+1,");
    expect(csv).toContain(",'+cmd,");
    expect(csv).toContain(",'-2+3,");
    expect(csv).toContain(",'@SUM(A1),");
    expect(csv).not.toMatch(/,[=+\-@][^,]*,/);
  });

  it("Security: API, auth, webhook and error responses carry the security headers", async () => {
    const responses = [
      await call({ path: "/api/me" }),
      await call({ path: "/api/auth/get-session" }),
      await call({ path: "/h/00000000000000000000000000000000", method: "POST", body: {} }),
      await call({ path: "/api/nope" }),
    ];

    for (const response of responses) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response.headers.get(name)).toBe(value);
      }
    }
    const csp = responses[0].headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com https://cdn.paddle.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(responses[0].headers.get("strict-transport-security")).toMatch(/max-age=\d{8}/);
  });

  it("Security: session cookies are HttpOnly, SameSite=Lax, and Secure on the https production URL", async () => {
    const email = uniqueEmail("cookie");
    const productionUrl = "https://inboxsieve.example";
    const auth = createAuth({ env: { ...env, APP_URL: productionUrl }, mailer: createLogMailer({ db }) });

    await auth.handler(
      new Request(`${productionUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: productionUrl },
        body: JSON.stringify({ email, callbackURL: "/app" }),
      }),
    );
    const link = await readMagicLink(email);
    const verified = await auth.handler(new Request(link, { redirect: "manual" }));
    const cookie = readSessionCookie(verified).header;
    const localCookie = readSessionCookie(await followMagicLink(await readLocalLink())).header;

    expect(link.startsWith(productionUrl)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(localCookie).toMatch(/HttpOnly/i);
    expect(localCookie).toMatch(/SameSite=Lax/i);
  });
});

async function readLocalLink() {
  const email = uniqueEmail("cookie-local");
  await requestMagicLink(email);
  return readMagicLink(email);
}
