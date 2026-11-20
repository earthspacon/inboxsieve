const HIT_RETENTION_MS = 24 * 60 * 60_000;

// Sliding window: counts the hits for `key` inside the window and records this one only when it is allowed.
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
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rate_limit_hits WHERE key = ? AND hit_at > ?")
    .bind(key, since)
    .first<{ n: number }>();

  if ((row?.n ?? 0) >= limit) {
    return false;
  }
  await db.prepare("INSERT INTO rate_limit_hits (key, hit_at) VALUES (?, ?)").bind(key, now.toISOString()).run();
  return true;
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
