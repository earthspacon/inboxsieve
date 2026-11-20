import {
  DEFAULT_ALERT_THRESHOLD,
  SUBSCRIPTION_ACCESS,
  type AccessLevel,
  type Plan,
  type SubscriptionStatus,
} from "@inboxsieve/contract";

import { newId } from "../ids";

export type AccountContext = {
  userId: string;
  email: string;
  accountId: string;
  plan: Plan;
  subscription: SubscriptionStatus;
  access: AccessLevel;
  role: "owner" | "member";
};

const DEFAULT_BRAND_NAME = "My brand";

export async function getAccountContext({ db, userId }: { db: D1Database; userId: string }) {
  const row = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, a.id AS account_id, a.plan, s.status, seat.role
       FROM users u
       JOIN seats seat ON seat.user_id = u.id AND seat.status = 'active'
       JOIN accounts a ON a.id = seat.account_id AND a.deletion_requested_at IS NULL
       JOIN subscriptions s ON s.account_id = a.id
       WHERE u.id = ?
       ORDER BY seat.created_at
       LIMIT 1`,
    )
    .bind(userId)
    .first<{
      user_id: string;
      email: string;
      account_id: string;
      plan: Plan;
      status: SubscriptionStatus;
      role: "owner" | "member";
    }>();

  if (!row) {
    return null;
  }

  const context: AccountContext = {
    userId: row.user_id,
    email: row.email,
    accountId: row.account_id,
    plan: row.plan,
    subscription: row.status,
    access: SUBSCRIPTION_ACCESS[row.status],
    role: row.role,
  };
  return context;
}

export async function createAccount({
  db,
  userId,
  email,
  plan,
  status,
  now,
}: {
  db: D1Database;
  userId: string;
  email: string;
  plan: Plan;
  status: SubscriptionStatus;
  now: Date;
}) {
  const accountId = newId();
  const at = now.toISOString();

  await db.batch([
    db
      .prepare("INSERT INTO accounts (id, owner_user_id, plan, created_at) VALUES (?, ?, ?, ?)")
      .bind(accountId, userId, plan, at),
    db
      .prepare("INSERT INTO subscriptions (account_id, status, updated_at) VALUES (?, ?, ?)")
      .bind(accountId, status, at),
    db
      .prepare(
        `INSERT INTO seats (id, account_id, user_id, email, role, status, created_at) VALUES (?, ?, ?, ?, 'owner', 'active', ?)`,
      )
      .bind(newId(), accountId, userId, email, at),
    db
      .prepare("INSERT INTO brands (id, account_id, name, alert_threshold, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(newId(), accountId, DEFAULT_BRAND_NAME, DEFAULT_ALERT_THRESHOLD, at),
  ]);
  return accountId;
}

export async function setSubscription({
  db,
  accountId,
  status,
  plan,
  now,
}: {
  db: D1Database;
  accountId: string;
  status: SubscriptionStatus;
  plan: Plan;
  now: Date;
}) {
  await db.batch([
    db
      .prepare("UPDATE subscriptions SET status = ?, updated_at = ? WHERE account_id = ?")
      .bind(status, now.toISOString(), accountId),
    db.prepare("UPDATE accounts SET plan = ? WHERE id = ?").bind(plan, accountId),
  ]);
}

export async function getAccountPlan({ db, accountId }: { db: D1Database; accountId: string }) {
  const row = await db.prepare("SELECT plan FROM accounts WHERE id = ?").bind(accountId).first<{ plan: Plan }>();
  return row?.plan ?? null;
}
