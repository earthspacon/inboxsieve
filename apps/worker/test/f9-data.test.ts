import { LEAD_CSV_COLUMNS } from "@inboxsieve/contract";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { admitLead } from "../src/leads/pipeline";
import { runMaintenance } from "../src/maintenance";
import { buildLeadInput, buildTestDeps, countRows, createMockAnalyzer, db, seedSource, uniqueEmail } from "./helpers";
import { BASE, signInTrial } from "./session";

const DAY_MS = 24 * 60 * 60 * 1000;

async function call({
  cookie,
  path,
  method = "GET",
  body,
}: {
  cookie: string;
  path: string;
  method?: string;
  body?: unknown;
}) {
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      origin: BASE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function addLead({
  brandId,
  sourceId,
  receivedAt,
  message,
}: {
  brandId: string;
  sourceId: string;
  receivedAt: Date;
  message?: string;
}) {
  const result = await admitLead({
    db,
    brandId,
    sourceId,
    dedupeKey: null,
    parsed: { ok: true, lead: buildLeadInput(message ? { message } : {}) },
    raw: "From: dana@northwind.example\r\n\r\nraw body",
    authResults: null,
    now: receivedAt,
  });
  return result.leadId;
}

function maintenanceDeps() {
  return buildTestDeps({ analyzer: createMockAnalyzer().analyzer }).deps;
}

describe("F9 data", () => {
  it("F9: the CSV export has the contract's columns, one row per lead, formulas neutralized", async () => {
    const session = await signInTrial({ email: uniqueEmail("csv") });
    const source = await seedSource({ brandId: session.brandId, kind: "webhook" });
    await addLead({
      brandId: session.brandId,
      sourceId: source.id,
      receivedAt: new Date(),
      message: '=HYPERLINK("x")',
    });
    await addLead({ brandId: session.brandId, sourceId: source.id, receivedAt: new Date() });

    const response = await call({ cookie: session.cookie, path: `/api/brands/${session.brandId}/export.csv` });
    const lines = (await response.text()).trimEnd().split("\r\n");

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(lines[0]).toBe(LEAD_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("F9: delete account needs the typed confirmation, locks at once and the purge removes every row", async () => {
    const email = uniqueEmail("leaving");
    const session = await signInTrial({ email, plan: "agency" });
    const source = await seedSource({ brandId: session.brandId, kind: "webhook" });
    await addLead({ brandId: session.brandId, sourceId: source.id, receivedAt: new Date() });
    const tables = [
      ["accounts", "SELECT COUNT(*) AS n FROM accounts WHERE id = ?"],
      ["subscriptions", "SELECT COUNT(*) AS n FROM subscriptions WHERE account_id = ?"],
      ["seats", "SELECT COUNT(*) AS n FROM seats WHERE account_id = ?"],
      ["brands", "SELECT COUNT(*) AS n FROM brands WHERE account_id = ?"],
      ["sources", "SELECT COUNT(*) AS n FROM sources WHERE id = ?"],
      ["leads", "SELECT COUNT(*) AS n FROM leads WHERE brand_id = ?"],
      ["lead_events", "SELECT COUNT(*) AS n FROM lead_events WHERE brand_id = ?"],
      ["users", "SELECT COUNT(*) AS n FROM users WHERE email = ?"],
    ];
    const binds = [
      session.accountId,
      session.accountId,
      session.accountId,
      session.accountId,
      source.id,
      session.brandId,
      session.brandId,
      email,
    ];
    const countAll = () => {
      return Promise.all(
        tables.map(([, sql], index) => {
          return countRows({ sql, binds: [binds[index]] });
        }),
      );
    };

    const wrong = await call({
      cookie: session.cookie,
      path: "/api/account",
      method: "DELETE",
      body: { confirm: "delete" },
    });
    const accepted = await call({
      cookie: session.cookie,
      path: "/api/account",
      method: "DELETE",
      body: { confirm: "DELETE" },
    });
    const afterRequest = await call({ cookie: session.cookie, path: "/api/me" });
    const beforePurge = await countAll();
    await runMaintenance({ deps: maintenanceDeps(), now: new Date(Date.now() + 1000) });
    const afterPurge = await countAll();
    const confirmation = await countRows({
      sql: "SELECT COUNT(*) AS n FROM dev_outbox WHERE to_address = ? AND subject = 'Your InboxSieve workspace is deleted'",
      binds: [email],
    });

    expect(wrong.status).toBe(400);
    expect(accepted.status).toBe(202);
    expect(afterRequest.status).toBe(401);
    expect(beforePurge.every((n) => n > 0)).toBe(true);
    expect(afterPurge).toEqual(tables.map(() => 0));
    expect(confirmation).toBe(1);
  });

  it("F9: the purge job nulls raw bodies older than 90 days and keeps newer ones", async () => {
    const session = await signInTrial({ email: uniqueEmail("raw") });
    const source = await seedSource({ brandId: session.brandId, kind: "webhook" });
    const now = new Date();
    const oldId = await addLead({
      brandId: session.brandId,
      sourceId: source.id,
      receivedAt: new Date(now.getTime() - 91 * DAY_MS),
    });
    const newId = await addLead({
      brandId: session.brandId,
      sourceId: source.id,
      receivedAt: new Date(now.getTime() - 89 * DAY_MS),
    });

    await runMaintenance({ deps: maintenanceDeps(), now });
    const rows = await db
      .prepare("SELECT id, raw IS NULL AS purged, message FROM leads WHERE id IN (?, ?)")
      .bind(oldId, newId)
      .all<{ id: string; purged: number; message: string }>();
    const original = await call({
      cookie: session.cookie,
      path: `/api/brands/${session.brandId}/leads/${oldId}/original`,
    });

    expect(Object.fromEntries(rows.results.map((row) => [row.id, row.purged]))).toEqual({ [oldId]: 1, [newId]: 0 });
    expect(rows.results.every((row) => row.message.length > 0)).toBe(true);
    expect(original.status).toBe(404);
  });

  it("F9: an account expired for 30 days is hard-deleted", async () => {
    const session = await signInTrial({ email: uniqueEmail("expired") });
    await db
      .prepare("UPDATE subscriptions SET status = 'expired', status_since = ? WHERE account_id = ?")
      .bind(new Date(Date.now() - 31 * DAY_MS).toISOString(), session.accountId)
      .run();

    await runMaintenance({ deps: maintenanceDeps(), now: new Date() });

    expect(
      await countRows({ sql: "SELECT COUNT(*) AS n FROM accounts WHERE id = ?", binds: [session.accountId] }),
    ).toBe(0);
  });

  it("F9: delete brand needs its name typed, and the last brand can't go", async () => {
    const session = await signInTrial({ email: uniqueEmail("brands"), plan: "agency" });
    const second = await (
      await call({ cookie: session.cookie, path: "/api/brands", method: "POST", body: { name: "Client B" } })
    ).json<{ id: string }>();

    const wrong = await call({
      cookie: session.cookie,
      path: `/api/brands/${second.id}`,
      method: "DELETE",
      body: { confirm: "client b" },
    });
    const deleted = await call({
      cookie: session.cookie,
      path: `/api/brands/${second.id}`,
      method: "DELETE",
      body: { confirm: "Client B" },
    });
    const last = await call({
      cookie: session.cookie,
      path: `/api/brands/${session.brandId}`,
      method: "DELETE",
      body: { confirm: "My brand" },
    });

    expect([wrong.status, deleted.status, last.status]).toEqual([400, 204, 409]);
  });
});
