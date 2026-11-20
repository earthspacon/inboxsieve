import type { FeedbackKind } from "@inboxsieve/contract";

import type { FeedbackExample } from "../analysis/analyzer";
import { newId } from "../ids";

const MAX_EXAMPLES = 5;

export async function addFeedback({
  db,
  brandId,
  leadId,
  kind,
  expectedScore,
  note,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  kind: FeedbackKind;
  expectedScore: number | null;
  note: string;
  now: Date;
}) {
  const row = await db
    .prepare(
      `INSERT INTO feedback (id, brand_id, lead_id, kind, expected_score, note, created_at)
       SELECT ?, brand_id, id, ?, ?, ?, ? FROM leads WHERE id = ? AND brand_id = ?
       RETURNING id`,
    )
    .bind(newId(), kind, expectedScore, note, now.toISOString(), leadId, brandId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function listFeedbackExamples({ db, brandId }: { db: D1Database; brandId: string }) {
  const { results } = await db
    .prepare(
      `SELECT f.kind, l.subject, l.message, f.expected_score, f.note
       FROM feedback f JOIN leads l ON l.id = f.lead_id
       WHERE f.brand_id = ? AND l.brand_id = ?
       ORDER BY f.created_at DESC LIMIT ?`,
    )
    .bind(brandId, brandId, MAX_EXAMPLES)
    .all<{ kind: FeedbackKind; subject: string; message: string; expected_score: number | null; note: string }>();

  return results.map((row): FeedbackExample => {
    return {
      kind: row.kind,
      subject: row.subject,
      message: row.message,
      expectedScore: row.expected_score,
      note: row.note,
    };
  });
}
