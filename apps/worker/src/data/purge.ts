import type { Mailer } from "../mailer";

const RAW_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Raw message bodies older than 90 days are dropped; parsed fields stay until deletion.
export async function purgeOldRawBodies({ db, now }: { db: D1Database; now: Date }) {
  const result = await db
    .prepare("UPDATE leads SET raw = NULL WHERE raw IS NOT NULL AND received_at < ?")
    .bind(new Date(now.getTime() - RAW_RETENTION_DAYS * DAY_MS).toISOString())
    .run();
  return result.meta.changes;
}

// Hard-deletes every row of accounts whose deletion was requested, then emails the owner once.
export async function purgeDeletedAccounts({ db, mailer, now }: { db: D1Database; mailer: Mailer; now: Date }) {
  const { results } = await db
    .prepare(
      `SELECT a.id, u.email FROM accounts a JOIN users u ON u.id = a.owner_user_id
       WHERE a.deletion_requested_at IS NOT NULL AND a.deletion_requested_at <= ?`,
    )
    .bind(now.toISOString())
    .all<{ id: string; email: string }>();

  for (const account of results) {
    await deleteAccountRows({ db, accountId: account.id });
    await mailer.send({
      to: account.email,
      subject: "Your InboxSieve workspace is deleted",
      text: "Every lead, source, brand and seat of your InboxSieve workspace is now permanently deleted. Thanks for trying us.",
    });
  }
  return results.length;
}

async function deleteAccountRows({ db, accountId }: { db: D1Database; accountId: string }) {
  const brands = "SELECT id FROM brands WHERE account_id = ?1";
  const { results: seatUsers } = await db
    .prepare("SELECT user_id FROM seats WHERE account_id = ? AND user_id IS NOT NULL")
    .bind(accountId)
    .all<{ user_id: string }>();
  const userIds = JSON.stringify(seatUsers.map((row) => row.user_id));

  await db.batch([
    db.prepare(`DELETE FROM alert_deliveries WHERE brand_id IN (${brands})`).bind(accountId),
    db.prepare(`DELETE FROM feedback WHERE brand_id IN (${brands})`).bind(accountId),
    db.prepare(`DELETE FROM lead_events WHERE brand_id IN (${brands})`).bind(accountId),
    db.prepare(`DELETE FROM leads WHERE brand_id IN (${brands})`).bind(accountId),
    db.prepare(`DELETE FROM sources WHERE brand_id IN (${brands})`).bind(accountId),
    db.prepare("DELETE FROM brands WHERE account_id = ?1").bind(accountId),
    db.prepare("DELETE FROM seats WHERE account_id = ?1").bind(accountId),
    db.prepare("DELETE FROM subscriptions WHERE account_id = ?1").bind(accountId),
    db.prepare("DELETE FROM accounts WHERE id = ?1").bind(accountId),
    // People with no seat left anywhere go too, with their sessions and auth rows.
    ...["sessions", "auth_identities"].map((table) => {
      return db
        .prepare(
          `DELETE FROM ${table} WHERE user_id IN (SELECT value FROM json_each(?1))
             AND user_id NOT IN (SELECT user_id FROM seats WHERE user_id IS NOT NULL)`,
        )
        .bind(userIds);
    }),
    db
      .prepare(
        `DELETE FROM users WHERE id IN (SELECT value FROM json_each(?1))
           AND id NOT IN (SELECT user_id FROM seats WHERE user_id IS NOT NULL)
           AND id NOT IN (SELECT owner_user_id FROM accounts)`,
      )
      .bind(userIds),
  ]);
}
