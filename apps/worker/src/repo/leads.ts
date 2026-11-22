import {
  PAST_DUE_GRACE_DAYS,
  type Analysis,
  type Category,
  type LeadDetailDto,
  type LeadEventDto,
  type LeadInput,
  type LeadStage,
  type LeadStageCountsDto,
  type LeadStatus,
  type LeadSummaryDto,
} from "@inboxsieve/contract";

import { newId } from "../ids";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LeadRow = {
  id: string;
  brand_id: string;
  source_id: string;
  dedupe_key: string | null;
  status: LeadStatus;
  stage: LeadStage;
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
  raw: string | null;
  auth_results: string | null;
  analysis: string | null;
  score: number | null;
  category: Category | null;
  draft: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  counts_to_quota: number;
  received_at: string;
  analyzed_at: string | null;
  replied_at: string | null;
};

export type LeadFilters = {
  scoreMin: number | null;
  scoreMax: number | null;
  category: Category | null;
  stage: LeadStage | null;
  status: LeadStatus | null;
  query: string | null;
  before: string | null;
  limit: number;
};

type LeadUpdate = Partial<
  Pick<
    LeadRow,
    | "stage"
    | "analysis"
    | "score"
    | "category"
    | "draft"
    | "attempts"
    | "next_attempt_at"
    | "last_error"
    | "counts_to_quota"
    | "analyzed_at"
  >
>;

type EventRow = {
  type: LeadEventDto["type"];
  from_value: string | null;
  to_value: string | null;
  at: string;
};

export async function insertLead({
  db,
  brandId,
  sourceId,
  dedupeKey,
  lead,
  raw,
  authResults,
  now,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
  dedupeKey: string | null;
  lead: LeadInput;
  raw: string | null;
  authResults: string | null;
  now: Date;
}) {
  const id = newId();
  const at = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO leads (id, brand_id, source_id, dedupe_key, status, name, email, company, subject, message, raw, auth_results, received_at)
       VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (brand_id, dedupe_key) DO NOTHING
       RETURNING id`,
    )
    .bind(
      id,
      brandId,
      sourceId,
      dedupeKey,
      lead.name,
      lead.email,
      lead.company,
      lead.subject,
      lead.message,
      raw,
      authResults,
      at,
    )
    .first<{ id: string }>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId: id,
    type: "status",
    from: null,
    to: "received",
    at,
  });
  return id;
}

export async function findLeadByDedupeKey({
  db,
  brandId,
  dedupeKey,
}: {
  db: D1Database;
  brandId: string;
  dedupeKey: string;
}) {
  return db
    .prepare("SELECT id, status FROM leads WHERE brand_id = ? AND dedupe_key = ?")
    .bind(brandId, dedupeKey)
    .first<{ id: string; status: LeadStatus }>();
}

export async function transitionLead({
  db,
  brandId,
  leadId,
  from,
  to,
  set = {},
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  from: LeadStatus;
  to: LeadStatus;
  set?: LeadUpdate;
  now: Date;
}) {
  const entries = Object.entries(set);
  const assignments = entries.map(([column]) => `, ${column} = ?`).join("");
  const values = entries.map(([, value]) => value);
  const row = await db
    .prepare(`UPDATE leads SET status = ?${assignments} WHERE id = ? AND brand_id = ? AND status = ? RETURNING *`)
    .bind(to, ...values, leadId, brandId, from)
    .first<LeadRow>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId,
    type: "status",
    from,
    to,
    at: now.toISOString(),
  });
  if (set.stage) {
    await insertEvent({
      db,
      brandId,
      leadId,
      type: "stage",
      from: null,
      to: set.stage,
      at: now.toISOString(),
    });
  }
  return row;
}

export async function claimLead({
  db,
  brandId,
  leadId,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  now: Date;
}) {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `UPDATE leads SET status = 'analyzing', attempts = attempts + 1, next_attempt_at = ?
       WHERE id = ? AND brand_id = ? AND status = 'queued' AND next_attempt_at <= ? RETURNING *`,
    )
    .bind(at, leadId, brandId, at)
    .first<LeadRow>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId,
    type: "status",
    from: "queued",
    to: "analyzing",
    at,
  });
  return row;
}

// The cron sweep is the queue: it runs across brands and hands each job its brand id.
// Analysis runs for every account but a paused one (Free included); past_due keeps it for PAST_DUE_GRACE_DAYS, then pauses.
export async function listDueLeads({ db, now, limit }: { db: D1Database; now: Date; limit: number }) {
  const graceStart = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * DAY_MS);
  const { results } = await db
    .prepare(
      `SELECT l.id, l.brand_id FROM leads l
       JOIN brands b ON b.id = l.brand_id
       JOIN subscriptions s ON s.account_id = b.account_id
       WHERE l.status = 'queued' AND l.next_attempt_at <= ?
         AND s.status != 'paused'
         AND (s.status != 'past_due' OR s.past_due_since IS NULL OR s.past_due_since > ?)
       ORDER BY l.next_attempt_at LIMIT ?`,
    )
    .bind(now.toISOString(), graceStart.toISOString(), limit)
    .all<{ id: string; brand_id: string }>();
  return results;
}

export async function requeueStaleLeads({ db, staleBefore }: { db: D1Database; staleBefore: Date }) {
  const result = await db
    .prepare(`UPDATE leads SET status = 'queued' WHERE status = 'analyzing' AND next_attempt_at < ?`)
    .bind(staleBefore.toISOString())
    .run();
  return result.meta.changes;
}

export async function queueRescore({
  db,
  brandId,
  limit,
  now,
}: {
  db: D1Database;
  brandId: string;
  limit: number;
  now: Date;
}) {
  const at = now.toISOString();
  const { results } = await db
    .prepare(
      `UPDATE leads SET status = 'queued', attempts = 0, next_attempt_at = ?, last_error = NULL
       WHERE id IN (
         SELECT id FROM leads WHERE brand_id = ? AND status IN ('analyzed', 'analysis_failed')
         ORDER BY received_at DESC LIMIT ?
       )
       RETURNING id`,
    )
    .bind(at, brandId, limit)
    .all<{ id: string }>();

  if (results.length > 0) {
    await db.batch(
      results.map(({ id }) => {
        return db
          .prepare(
            `INSERT INTO lead_events (lead_id, brand_id, type, from_value, to_value, at) VALUES (?, ?, 'status', NULL, 'queued', ?)`,
          )
          .bind(id, brandId, at);
      }),
    );
  }
  return results.length;
}

export async function countMonthlyLeads({
  db,
  accountId,
  monthStart,
}: {
  db: D1Database;
  accountId: string;
  monthStart: Date;
}) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN brands b ON b.id = l.brand_id
       WHERE b.account_id = ? AND l.counts_to_quota = 1 AND l.received_at >= ?`,
    )
    .bind(accountId, monthStart.toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listLeads({ db, brandId, filters }: { db: D1Database; brandId: string; filters: LeadFilters }) {
  const conditions = ["brand_id = ?"];
  const values: Array<string | number> = [brandId];

  if (filters.scoreMin !== null) {
    conditions.push("score >= ?");
    values.push(filters.scoreMin);
  }
  if (filters.scoreMax !== null) {
    conditions.push("score <= ?");
    values.push(filters.scoreMax);
  }
  if (filters.category) {
    conditions.push("category = ?");
    values.push(filters.category);
  }
  if (filters.stage) {
    conditions.push("stage = ?");
    values.push(filters.stage);
  }
  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }
  if (filters.query) {
    conditions.push(
      `(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\')`,
    );
    const pattern = `%${filters.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  if (filters.before) {
    conditions.push("received_at < ?");
    values.push(filters.before);
  }

  const { results } = await db
    .prepare(`SELECT * FROM leads WHERE ${conditions.join(" AND ")} ORDER BY received_at DESC, id LIMIT ?`)
    .bind(...values, filters.limit)
    .all<LeadRow>();
  return results.map(mapLeadRowToSummary);
}

export async function countLeadsByStage({ db, brandId }: { db: D1Database; brandId: string }) {
  const counts: LeadStageCountsDto = {
    new: 0,
    contacted: 0,
    meeting: 0,
    won: 0,
    lost: 0,
    spam: 0,
    pitch: 0,
  };
  const { results } = await db
    .prepare("SELECT stage, COUNT(*) AS n FROM leads WHERE brand_id = ? GROUP BY stage")
    .bind(brandId)
    .all<{ stage: LeadStage; n: number }>();

  for (const row of results) {
    counts[row.stage] = row.n;
  }
  return counts;
}

// True once a person has moved the lead out of that stage; the classifier must not put it back.
export async function hasLeftStage({
  db,
  brandId,
  leadId,
  stage,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  stage: LeadStage;
}) {
  const row = await db
    .prepare(
      "SELECT 1 AS found FROM lead_events WHERE lead_id = ? AND brand_id = ? AND type = 'stage' AND from_value = ? LIMIT 1",
    )
    .bind(leadId, brandId, stage)
    .first<{ found: number }>();
  return row !== null;
}

export async function getLead({ db, brandId, leadId }: { db: D1Database; brandId: string; leadId: string }) {
  return db.prepare("SELECT * FROM leads WHERE id = ? AND brand_id = ?").bind(leadId, brandId).first<LeadRow>();
}

export async function listLeadEvents({ db, brandId, leadId }: { db: D1Database; brandId: string; leadId: string }) {
  const { results } = await db
    .prepare("SELECT type, from_value, to_value, at FROM lead_events WHERE lead_id = ? AND brand_id = ? ORDER BY id")
    .bind(leadId, brandId)
    .all<EventRow>();
  return results.map(mapEventRowToDto);
}

export async function updateLeadStage({
  db,
  brandId,
  leadId,
  from,
  to,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  from: LeadStage;
  to: LeadStage;
  now: Date;
}) {
  const row = await db
    .prepare("UPDATE leads SET stage = ? WHERE id = ? AND brand_id = ? AND stage = ? RETURNING *")
    .bind(to, leadId, brandId, from)
    .first<LeadRow>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId,
    type: "stage",
    from,
    to,
    at: now.toISOString(),
  });
  return row;
}

export async function updateLeadDraft({
  db,
  brandId,
  leadId,
  draft,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  draft: string;
  now: Date;
}) {
  const row = await db
    .prepare("UPDATE leads SET draft = ? WHERE id = ? AND brand_id = ? RETURNING *")
    .bind(draft, leadId, brandId)
    .first<LeadRow>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId,
    type: "draft",
    from: null,
    to: null,
    at: now.toISOString(),
  });
  return row;
}

export async function markLeadReplied({
  db,
  brandId,
  leadId,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  now: Date;
}) {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `UPDATE leads SET replied_at = ?, stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END
       WHERE id = ? AND brand_id = ? AND stage NOT IN ('spam', 'lost') RETURNING *`,
    )
    .bind(at, leadId, brandId)
    .first<LeadRow>();

  if (!row) {
    return null;
  }
  await insertEvent({
    db,
    brandId,
    leadId,
    type: "replied",
    from: null,
    to: row.stage,
    at,
  });
  return row;
}

export async function insertEvent({
  db,
  brandId,
  leadId,
  type,
  from,
  to,
  at,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  type: LeadEventDto["type"];
  from: string | null;
  to: string | null;
  at: string;
}) {
  await db
    .prepare("INSERT INTO lead_events (lead_id, brand_id, type, from_value, to_value, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(leadId, brandId, type, from, to, at)
    .run();
}

export function mapLeadRowToSummary(row: LeadRow): LeadSummaryDto {
  return {
    id: row.id,
    brandId: row.brand_id,
    sourceId: row.source_id,
    status: row.status,
    stage: row.stage,
    name: row.name,
    email: row.email,
    company: row.company,
    subject: row.subject,
    score: row.score,
    category: row.category,
    receivedAt: row.received_at,
  };
}

export function mapLeadRowToDetail({ row, events }: { row: LeadRow; events: LeadEventDto[] }): LeadDetailDto {
  const analysis: Analysis | null = row.analysis ? JSON.parse(row.analysis) : null;

  return {
    ...mapLeadRowToSummary(row),
    message: row.message,
    analysis,
    draft: row.draft,
    repliedAt: row.replied_at,
    lastError: row.last_error,
    hasOriginal: row.raw !== null,
    events,
  };
}

function mapEventRowToDto(row: EventRow): LeadEventDto {
  return {
    type: row.type,
    from: row.from_value,
    to: row.to_value,
    at: row.at,
  };
}

export async function countSourceLeads({
  db,
  brandId,
  sourceId,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
}) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM leads WHERE brand_id = ? AND source_id = ?")
    .bind(brandId, sourceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
