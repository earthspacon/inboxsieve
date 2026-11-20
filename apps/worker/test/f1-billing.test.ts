import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runDueJobs } from "../src/leads/jobs";
import { admitLead } from "../src/leads/pipeline";
import { runMaintenance } from "../src/maintenance";
import { createApiClient } from "./api-client";
import {
  buildLeadInput,
  buildTestDeps,
  countRows,
  createMockAnalyzer,
  db,
  seedAccount,
  seedSource,
  uniqueEmail,
} from "./helpers";
import { buildPaddleEvent, postPaddleEvent, sendFixture } from "./paddle";
import { BASE, signIn } from "./session";

const DAY_MS = 24 * 60 * 60 * 1000;

async function readStatus(accountId: string) {
  const row = await db
    .prepare(
      "SELECT s.status, a.plan FROM subscriptions s JOIN accounts a ON a.id = s.account_id WHERE s.account_id = ?",
    )
    .bind(accountId)
    .first<{ status: string; plan: string }>();
  return row;
}

async function seedFreeAccount() {
  return seedAccount({ status: "no_subscription" });
}

describe("F1 billing: Paddle webhooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("F1 billing: the signed subscription.created fixture moves a new Free account to a Solo trial", async () => {
    const email = uniqueEmail("f1b");
    const cookie = await signIn(email);
    const before = await SELF.fetch(`${BASE}/api/brands`, { headers: { cookie } });
    const me = await (await SELF.fetch(`${BASE}/api/me`, { headers: { cookie } })).json<{ account: { id: string } }>();

    const result = await sendFixture({ fixture: "created", options: { accountId: me.account.id } });
    const after = await SELF.fetch(`${BASE}/api/brands`, { headers: { cookie } });

    expect(before.status).toBe(200);
    expect(result).toEqual({ status: 200, body: { received: true, outcome: "applied" } });
    expect(await readStatus(me.account.id)).toEqual({ status: "trialing", plan: "solo" });
    expect(after.status).toBe(200);
  });

  it("F1 billing: .updated, .past_due and .canceled fixtures move the account to the matching state", async () => {
    const { accountId } = await seedFreeAccount();
    const start = Date.now();
    const at = (offset: number) => new Date(start + offset * 1000);

    await sendFixture({ fixture: "created", options: { accountId, occurredAt: at(0) } });
    await sendFixture({ fixture: "scheduledCancel", options: { accountId, occurredAt: at(1) } });
    const updated = await readStatus(accountId);
    await sendFixture({ fixture: "pastDue", options: { accountId, occurredAt: at(2) } });
    const pastDue = await readStatus(accountId);
    await sendFixture({ fixture: "activated", options: { accountId, occurredAt: at(3) } });
    const activated = await readStatus(accountId);
    await sendFixture({ fixture: "canceled", options: { accountId, occurredAt: at(4) } });
    const canceled = await readStatus(accountId);

    expect([updated?.status, pastDue?.status, activated?.status, canceled?.status]).toEqual([
      "active",
      "past_due",
      "active",
      "canceled",
    ]);
  });

  it("F1 billing: .trialing and transaction.completed are accepted", async () => {
    const { accountId } = await seedFreeAccount();

    const trialing = await sendFixture({ fixture: "trialing", options: { accountId } });
    const transaction = await sendFixture({ fixture: "transactionCompleted", options: { accountId } });

    expect(trialing.body.outcome).toBe("applied");
    expect(transaction.body.outcome).toBe("recorded");
    expect((await readStatus(accountId))?.status).toBe("trialing");
  });

  it("F1 billing: an invalid signature returns 401 and leaves the state unchanged", async () => {
    const { accountId } = await seedFreeAccount();
    const body = buildPaddleEvent({ fixture: "created", options: { accountId } });

    const wrongSecret = await postPaddleEvent({ body, secret: "pdl_ntfset_someone_else" });
    const unsigned = await SELF.fetch(`${BASE}/paddle/webhook`, { method: "POST", body });
    const forged = await SELF.fetch(`${BASE}/paddle/webhook`, {
      method: "POST",
      headers: { "paddle-signature": `ts=${Math.floor(Date.now() / 1000)};h1=${"0".repeat(64)}` },
      body,
    });

    expect([wrongSecret.status, unsigned.status, forged.status]).toEqual([401, 401, 401]);
    expect((await readStatus(accountId))?.status).toBe("no_subscription");
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM paddle_events WHERE event_id = ?",
        binds: [JSON.parse(body).event_id],
      }),
    ).toBe(0);
  });

  it("F1 billing: a signature older than 5 seconds is rejected as a replay", async () => {
    const { accountId } = await seedFreeAccount();
    const body = buildPaddleEvent({ fixture: "created", options: { accountId } });

    const response = await postPaddleEvent({ body, ts: Math.floor(Date.now() / 1000) - 6 });

    expect(response.status).toBe(401);
    expect((await readStatus(accountId))?.status).toBe("no_subscription");
  });

  it("F1 billing: the same event delivered twice is applied once", async () => {
    const { accountId } = await seedFreeAccount();
    const body = buildPaddleEvent({ fixture: "created", options: { accountId } });

    const first = await postPaddleEvent({ body });
    const second = await postPaddleEvent({ body });

    expect(await first.json()).toMatchObject({ outcome: "applied" });
    expect(await second.json()).toMatchObject({ outcome: "duplicate" });
  });

  it("F1 billing: an illegal transition is acknowledged but changes nothing", async () => {
    const { accountId } = await seedFreeAccount();

    const result = await sendFixture({ fixture: "pastDue", options: { accountId } });

    expect(result).toEqual({ status: 200, body: { received: true, outcome: "illegal_transition" } });
    expect((await readStatus(accountId))?.status).toBe("no_subscription");
  });

  it("F1 billing: an event older than the last one applied is ignored", async () => {
    const { accountId } = await seedFreeAccount();
    await sendFixture({ fixture: "created", options: { accountId, occurredAt: new Date() } });

    const late = await sendFixture({
      fixture: "pastDue",
      options: { accountId, occurredAt: new Date(Date.now() - 60_000) },
    });

    expect(late.body.outcome).toBe("stale");
    expect((await readStatus(accountId))?.status).toBe("trialing");
  });

  it("F1 billing: past_due keeps analysis for 7 days, then pauses it while leads are still stored", async () => {
    const recent = await seedAccount({ status: "active" });
    const old = await seedAccount({ status: "active" });
    await db
      .prepare("UPDATE subscriptions SET status = 'past_due', past_due_since = ? WHERE account_id = ?")
      .bind(new Date(Date.now() - 2 * DAY_MS).toISOString(), recent.accountId)
      .run();
    await db
      .prepare("UPDATE subscriptions SET status = 'past_due', past_due_since = ? WHERE account_id = ?")
      .bind(new Date(Date.now() - 8 * DAY_MS).toISOString(), old.accountId)
      .run();
    const leadIds = [];
    for (const account of [recent, old]) {
      const source = await seedSource({ brandId: account.brandId, kind: "webhook" });
      const result = await admitLead({
        db,
        brandId: account.brandId,
        sourceId: source.id,
        dedupeKey: null,
        parsed: { ok: true, lead: buildLeadInput() },
        raw: "raw",
        authResults: null,
        now: new Date(),
      });
      leadIds.push(result.leadId);
    }
    const mock = createMockAnalyzer();

    await runDueJobs({ db, analyzer: mock.analyzer, now: new Date() });
    const statuses = await Promise.all(
      leadIds.map(async (id) => {
        return (await db.prepare("SELECT status FROM leads WHERE id = ?").bind(id).first<{ status: string }>())?.status;
      }),
    );

    expect(statuses).toEqual(["analyzed", "queued"]);
  });

  it("F1 billing: canceled keeps access until the period ends, then the account expires to read-only", async () => {
    const { accountId } = await seedFreeAccount();
    const periodEnd = new Date(Date.now() + DAY_MS).toISOString();
    await sendFixture({ fixture: "activated", options: { accountId, periodEnd } });
    await sendFixture({ fixture: "canceled", options: { accountId, occurredAt: new Date(Date.now() + 1000) } });
    const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });

    await runMaintenance({ deps, now: new Date() });
    const beforeEnd = await readStatus(accountId);
    await runMaintenance({ deps, now: new Date(Date.now() + 2 * DAY_MS) });

    expect(beforeEnd?.status).toBe("canceled");
    expect((await readStatus(accountId))?.status).toBe("expired");
  });

  it("F1 billing: GET /api/billing on Free carries the checkout config", async () => {
    const email = uniqueEmail("f1free");
    const cookie = await signIn(email);

    const response = await SELF.fetch(`${BASE}/api/billing`, { headers: { cookie } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      plan: "free",
      subscription: "no_subscription",
      checkout: {
        environment: "sandbox",
        prices: {
          solo: { monthly: env.PADDLE_PRICE_SOLO_MONTHLY },
          agency: { monthly: env.PADDLE_PRICE_AGENCY_MONTHLY },
        },
      },
    });
  });

  it("F1 billing: Manage billing asks Paddle for a portal session for the account's customer", async () => {
    const email = uniqueEmail("f1portal");
    const { accountId } = await seedAccount({ email, status: "no_subscription" });
    await sendFixture({ fixture: "activated", options: { accountId } });
    const cookie = await signIn(email);
    const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
    deps.env = {
      ...deps.env,
      PADDLE_API_KEY: "pdl_sdbx_apikey_test",
    };
    const paddle = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ data: { urls: { general: { overview: "https://customer-portal.paddle.com/cpl_example" } } } }),
      );

    const response = await createApiClient({ deps, cookie })("/api/billing/portal", { method: "POST" });

    expect(await response.json()).toEqual({ url: "https://customer-portal.paddle.com/cpl_example" });
    expect(String(paddle.mock.calls[0][0])).toBe(
      "https://sandbox-api.paddle.com/customers/ctm_01jexamplecustomer0000000/portal-sessions",
    );
  });
});
