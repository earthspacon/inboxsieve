import type { LeadCsvRow } from "../data/csv";

export async function listLeadsForExport({ db, brandId }: { db: D1Database; brandId: string }) {
  const { results } = await db
    .prepare(
      `SELECT id, received_at, source_id, status, stage, name, email, company, subject, message, score, category,
              json_extract(analysis, '$.summary') AS summary, draft, replied_at
       FROM leads WHERE brand_id = ? ORDER BY received_at DESC, id`,
    )
    .bind(brandId)
    .all<LeadCsvRow>();
  return results;
}

// Locks the workspace at once (every seat is signed out); the hourly purge deletes the rows.
export async function requestAccountDeletion({ db, accountId, now }: { db: D1Database; accountId: string; now: Date }) {
  const results = await db.batch([
    db
      .prepare("UPDATE accounts SET deletion_requested_at = ? WHERE id = ? AND deletion_requested_at IS NULL")
      .bind(now.toISOString(), accountId),
    db
      .prepare(
        "DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM seats WHERE account_id = ? AND user_id IS NOT NULL)",
      )
      .bind(accountId),
  ]);
  return results[0].meta.changes;
}

export async function deleteBrand({ db, accountId, brandId }: { db: D1Database; accountId: string; brandId: string }) {
  const owned = "SELECT id FROM brands WHERE id = ?1 AND account_id = ?2";
  const results = await db.batch([
    db.prepare(`DELETE FROM alert_deliveries WHERE brand_id IN (${owned})`).bind(brandId, accountId),
    db.prepare(`DELETE FROM feedback WHERE brand_id IN (${owned})`).bind(brandId, accountId),
    db.prepare(`DELETE FROM lead_events WHERE brand_id IN (${owned})`).bind(brandId, accountId),
    db.prepare(`DELETE FROM leads WHERE brand_id IN (${owned})`).bind(brandId, accountId),
    db.prepare(`DELETE FROM sources WHERE brand_id IN (${owned})`).bind(brandId, accountId),
    db.prepare("DELETE FROM brands WHERE id = ?1 AND account_id = ?2").bind(brandId, accountId),
  ]);
  return results[results.length - 1].meta.changes;
}
