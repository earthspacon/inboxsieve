import type { Plan, ScheduledChange, SubscriptionStatus } from "@inboxsieve/contract";

export type BillingRow = {
  account_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  paddle_price_id: string | null;
  current_period_end: string | null;
  pending_plan: Plan | null;
  scheduled_change: string | null;
  past_due_since: string | null;
  status_since: string | null;
  last_event_at: string | null;
};

export type SubscriptionUpdate = {
  status: SubscriptionStatus;
  plan: Plan;
  pendingPlan: Plan | null;
  paddleSubscriptionId: string | null;
  paddleCustomerId: string | null;
  paddlePriceId: string | null;
  currentPeriodEnd: string | null;
  scheduledChange: ScheduledChange | null;
  pastDueSince: string | null;
  statusSince: string | null;
  lastEventAt: string | null;
};

export async function getBillingRow({ db, accountId }: { db: D1Database; accountId: string }) {
  return db
    .prepare(`SELECT s.*, a.plan FROM subscriptions s JOIN accounts a ON a.id = s.account_id WHERE s.account_id = ?`)
    .bind(accountId)
    .first<BillingRow>();
}

export async function findAccountIdForPaddle({
  db,
  accountId,
  paddleSubscriptionId,
}: {
  db: D1Database;
  accountId: string | null;
  paddleSubscriptionId: string;
}) {
  const row = await db
    .prepare(
      `SELECT account_id FROM subscriptions WHERE account_id = ?
       UNION ALL
       SELECT account_id FROM subscriptions WHERE paddle_subscription_id = ?
       LIMIT 1`,
    )
    .bind(accountId ?? "", paddleSubscriptionId)
    .first<{ account_id: string }>();
  return row?.account_id ?? null;
}

export async function saveSubscription({
  db,
  accountId,
  update,
  now,
}: {
  db: D1Database;
  accountId: string;
  update: SubscriptionUpdate;
  now: Date;
}) {
  await db.batch([
    db
      .prepare(
        `UPDATE subscriptions SET status = ?, pending_plan = ?, paddle_subscription_id = ?, paddle_customer_id = ?,
           paddle_price_id = ?, current_period_end = ?, scheduled_change = ?, past_due_since = ?, status_since = ?,
           last_event_at = ?, updated_at = ?
         WHERE account_id = ?`,
      )
      .bind(
        update.status,
        update.pendingPlan,
        update.paddleSubscriptionId,
        update.paddleCustomerId,
        update.paddlePriceId,
        update.currentPeriodEnd,
        update.scheduledChange ? JSON.stringify(update.scheduledChange) : null,
        update.pastDueSince,
        update.statusSince,
        update.lastEventAt,
        now.toISOString(),
        accountId,
      ),
    db.prepare("UPDATE accounts SET plan = ? WHERE id = ?").bind(update.plan, accountId),
  ]);
}

export async function recordPaddleEvent({
  db,
  eventId,
  eventType,
  occurredAt,
  now,
}: {
  db: D1Database;
  eventId: string;
  eventType: string;
  occurredAt: string;
  now: Date;
}) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO paddle_events (event_id, event_type, occurred_at, outcome, received_at)
       VALUES (?, ?, ?, 'received', ?)`,
    )
    .bind(eventId, eventType, occurredAt, now.toISOString())
    .run();
  return result.meta.changes > 0;
}

export async function setPaddleEventOutcome({
  db,
  eventId,
  outcome,
}: {
  db: D1Database;
  eventId: string;
  outcome: string;
}) {
  await db.prepare("UPDATE paddle_events SET outcome = ? WHERE event_id = ?").bind(outcome, eventId).run();
}

export async function listDuePlanChanges({ db, now }: { db: D1Database; now: Date }) {
  const { results } = await db
    .prepare(`SELECT account_id FROM subscriptions WHERE pending_plan IS NOT NULL AND current_period_end <= ?`)
    .bind(now.toISOString())
    .all<{ account_id: string }>();
  return results.map((row) => row.account_id);
}

export async function listEndedCancellations({ db, now }: { db: D1Database; now: Date }) {
  const { results } = await db
    .prepare(
      `SELECT account_id FROM subscriptions
       WHERE status = 'canceled' AND (current_period_end IS NULL OR current_period_end <= ?)`,
    )
    .bind(now.toISOString())
    .all<{ account_id: string }>();
  return results.map((row) => row.account_id);
}

export async function listCheckoutReminders({ db, createdBefore }: { db: D1Database; createdBefore: Date }) {
  const { results } = await db
    .prepare(
      `SELECT a.id AS account_id, u.email FROM accounts a
       JOIN subscriptions s ON s.account_id = a.id
       JOIN users u ON u.id = a.owner_user_id
       WHERE s.status = 'no_subscription' AND a.checkout_reminder_sent_at IS NULL AND a.created_at <= ?`,
    )
    .bind(createdBefore.toISOString())
    .all<{ account_id: string; email: string }>();
  return results;
}

export async function markCheckoutReminded({ db, accountId, now }: { db: D1Database; accountId: string; now: Date }) {
  await db
    .prepare("UPDATE accounts SET checkout_reminder_sent_at = ? WHERE id = ?")
    .bind(now.toISOString(), accountId)
    .run();
}
