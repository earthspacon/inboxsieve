import type { PaidPlan } from "@inboxsieve/contract";

import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { newId } from "../ids";
import { runQueues } from "../leads/jobs";
import { runMaintenance } from "../maintenance";
import { createAccount, getAccountContext, setSubscription } from "../repo";
import type { PublicContext } from "./context";

const EMAIL_MAX_LENGTH = 254;
const OUTBOX_LIMIT = 20;
const ID_MAX_LENGTH = 64;
const USAGE_MAX = 5000;

// Dev-only: billing lands in S5, so local runs and tests start a trial here.
export const devRoutes: Route<PublicContext>[] = [
  route("POST", "/dev/accounts", async ({ deps, request }) => {
    const data = await readJson(request);
    const email = readString({ data, key: "email", maxLength: EMAIL_MAX_LENGTH }).trim().toLowerCase();
    const plan: PaidPlan = data.plan === "agency" ? "agency" : "solo";
    const now = deps.now();

    if (!email.includes("@")) {
      throw new HttpError(400, "invalid_field", '"email" must be an email address');
    }

    const userId = await ensureUser({ db: deps.db, email, now });
    const existing = await getAccountContext({ db: deps.db, userId });
    const accountId =
      existing?.accountId ??
      (await createAccount({
        db: deps.db,
        userId,
        email,
        plan,
        status: "trialing",
        now,
      }));

    await setSubscription({
      db: deps.db,
      accountId,
      status: "trialing",
      plan,
      now,
    });
    const brand = await deps.db
      .prepare("SELECT id FROM brands WHERE account_id = ? ORDER BY created_at, id LIMIT 1")
      .bind(accountId)
      .first<{ id: string }>();
    return json(
      {
        userId,
        accountId,
        brandId: brand?.id ?? null,
      },
      201,
    );
  }),

  route("GET", "/dev/outbox", async ({ deps, request }) => {
    const to = new URL(request.url).searchParams.get("to") ?? "";
    const { results } = await deps.db
      .prepare(
        'SELECT to_address AS "to", subject, body, created_at AS createdAt FROM dev_outbox WHERE to_address = ? ORDER BY id DESC LIMIT ?',
      )
      .bind(to.toLowerCase(), OUTBOX_LIMIT)
      .all();
    return json(results);
  }),

  route("POST", "/dev/usage", async ({ deps, request }) => {
    const data = await readJson(request);
    const brandId = readString({ data, key: "brandId", maxLength: ID_MAX_LENGTH });
    const count = typeof data.count === "number" ? Math.min(data.count, USAGE_MAX) : 0;
    const source = await deps.db
      .prepare("SELECT id FROM sources WHERE brand_id = ? ORDER BY created_at LIMIT 1")
      .bind(brandId)
      .first<{ id: string }>();

    if (!source) {
      throw new HttpError(409, "no_source", "The brand needs a source first");
    }
    const at = deps.now().toISOString();
    const insert = deps.db.prepare(
      `INSERT INTO leads (id, brand_id, source_id, status, stage, subject, counts_to_quota, received_at)
       VALUES (?, ?, ?, 'analyzed', 'won', 'Usage filler', 1, ?)`,
    );
    await deps.db.batch(
      Array.from({ length: count }, () => {
        return insert.bind(newId(), brandId, source.id, at);
      }),
    );
    return json({ inserted: count }, 201);
  }),

  route("POST", "/dev/run-maintenance", async ({ deps, request }) => {
    const data = await readJson(request);
    const now = typeof data.now === "string" ? new Date(data.now) : deps.now();
    return json(await runMaintenance({ deps, now }));
  }),

  route("GET", "/dev/account-rows", async ({ deps, request }) => {
    const accountId = new URL(request.url).searchParams.get("accountId") ?? "";
    return json(await countAccountRows({ db: deps.db, accountId }));
  }),

  route("POST", "/dev/run-jobs", async ({ deps }) => {
    const processed = await runQueues(deps);
    return json({ processed });
  }),
];

async function ensureUser({ db, email, now }: { db: D1Database; email: string; now: Date }) {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, '', ?, 1, ?, ?)
       ON CONFLICT (email) DO UPDATE SET updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(newId(), email, at, at)
    .first<{ id: string }>();

  if (!row) {
    throw new Error("Could not create the user");
  }
  return row.id;
}

// Every table that holds rows of one account, for the F9 deletion check.
async function countAccountRows({ db, accountId }: { db: D1Database; accountId: string }) {
  const brands = "SELECT id FROM brands WHERE account_id = ?1";
  const queries: Record<string, string> = {
    accounts: "SELECT COUNT(*) AS n FROM accounts WHERE id = ?1",
    subscriptions: "SELECT COUNT(*) AS n FROM subscriptions WHERE account_id = ?1",
    seats: "SELECT COUNT(*) AS n FROM seats WHERE account_id = ?1",
    brands: "SELECT COUNT(*) AS n FROM brands WHERE account_id = ?1",
    sources: `SELECT COUNT(*) AS n FROM sources WHERE brand_id IN (${brands})`,
    leads: `SELECT COUNT(*) AS n FROM leads WHERE brand_id IN (${brands})`,
    lead_events: `SELECT COUNT(*) AS n FROM lead_events WHERE brand_id IN (${brands})`,
    feedback: `SELECT COUNT(*) AS n FROM feedback WHERE brand_id IN (${brands})`,
    alert_deliveries: `SELECT COUNT(*) AS n FROM alert_deliveries WHERE brand_id IN (${brands})`,
  };
  const counts: Record<string, number> = {};
  for (const [table, sql] of Object.entries(queries)) {
    counts[table] = (await db.prepare(sql).bind(accountId).first<{ n: number }>())?.n ?? 0;
  }
  return counts;
}
