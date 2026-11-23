const HIT_RETENTION_MS = 24 * 60 * 60_000;

// Sliding window: records this hit only when fewer than `limit` hits for `key` are inside the window.
export async function consumeRateLimit({
  db,
  key,
  limit,
  windowMs,
  now,
}: {
  db: D1Database;
  key: string;
  limit: number;
  windowMs: number;
  now: Date;
}) {
  const since = new Date(now.getTime() - windowMs).toISOString();
  // One guarded statement, so parallel requests cannot all read the same count and pass.
  const result = await db
    .prepare(
      `INSERT INTO rate_limit_hits (key, hit_at)
       SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM rate_limit_hits WHERE key = ?1 AND hit_at > ?3) < ?4`,
    )
    .bind(key, now.toISOString(), since, limit)
    .run();

  return result.meta.changes > 0;
}

export async function purgeOldRateLimitHits({ db, now }: { db: D1Database; now: Date }) {
  const result = await db
    .prepare("DELETE FROM rate_limit_hits WHERE hit_at < ?")
    .bind(new Date(now.getTime() - HIT_RETENTION_MS).toISOString())
    .run();
  return result.meta.changes;
}

export async function getLlmSpend({ db, day, accountId }: { db: D1Database; day: string; accountId: string | null }) {
  const row = await db
    .prepare("SELECT COALESCE(SUM(usd), 0) AS usd FROM llm_spend WHERE day = ?1 AND (?2 IS NULL OR account_id = ?2)")
    .bind(day, accountId)
    .first<{ usd: number }>();
  return row?.usd ?? 0;
}

export async function addLlmSpend({
  db,
  day,
  accountId,
  usd,
}: {
  db: D1Database;
  day: string;
  accountId: string;
  usd: number;
}) {
  await db
    .prepare(
      `INSERT INTO llm_spend (day, account_id, usd) VALUES (?, ?, ?)
       ON CONFLICT (day, account_id) DO UPDATE SET usd = usd + excluded.usd`,
    )
    .bind(day, accountId, usd)
    .run();
}

// True only for the first caller of the day, so the owner gets one email.
export async function claimLlmCapAlert({ db, day, now }: { db: D1Database; day: string; now: Date }) {
  const result = await db
    .prepare("INSERT INTO llm_cap_alerts (day, sent_at) VALUES (?, ?) ON CONFLICT (day) DO NOTHING")
    .bind(day, now.toISOString())
    .run();
  return result.meta.changes > 0;
}
