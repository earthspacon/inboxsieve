import type { SeatDto } from "@inboxsieve/contract";

import { newId } from "../ids";

type SeatRow = {
  id: string;
  email: string;
  role: "owner" | "member";
  status: "invited" | "active" | "revoked";
  created_at: string;
};

export async function listSeats({ db, accountId }: { db: D1Database; accountId: string }) {
  const { results } = await db
    .prepare(
      "SELECT id, email, role, status, created_at FROM seats WHERE account_id = ? AND status != 'revoked' ORDER BY created_at, id",
    )
    .bind(accountId)
    .all<SeatRow>();
  return results.map(mapSeatRowToDto);
}

// A revoked email can be invited again; an invited or active one is left as it is.
export async function inviteSeat({
  db,
  accountId,
  email,
  now,
}: {
  db: D1Database;
  accountId: string;
  email: string;
  now: Date;
}) {
  const row = await db
    .prepare(
      `INSERT INTO seats (id, account_id, user_id, email, role, status, created_at)
       VALUES (?, ?, NULL, ?, 'member', 'invited', ?)
       ON CONFLICT (account_id, email) DO UPDATE SET status = 'invited', user_id = NULL, created_at = excluded.created_at
         WHERE seats.status = 'revoked'
       RETURNING id, email, role, status, created_at`,
    )
    .bind(newId(), accountId, email, now.toISOString())
    .first<SeatRow>();
  return row ? mapSeatRowToDto(row) : null;
}

// Revokes a member seat and signs that person out everywhere. Returns the seat or null.
export async function revokeSeat({ db, accountId, seatId }: { db: D1Database; accountId: string; seatId: string }) {
  const row = await db
    .prepare(
      `UPDATE seats SET status = 'revoked' WHERE id = ? AND account_id = ? AND role = 'member' AND status != 'revoked'
       RETURNING id, email, role, status, created_at, user_id`,
    )
    .bind(seatId, accountId)
    .first<SeatRow & { user_id: string | null }>();

  if (!row) {
    return null;
  }
  if (row.user_id) {
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
  }
  return mapSeatRowToDto(row);
}

export async function hasPendingInvite({ db, email }: { db: D1Database; email: string }) {
  const row = await db
    .prepare("SELECT 1 AS found FROM seats WHERE email = ? AND status = 'invited' LIMIT 1")
    .bind(email.toLowerCase())
    .first<{ found: number }>();
  return row !== null;
}

export async function acceptPendingInvites({ db, userId }: { db: D1Database; userId: string }) {
  await db
    .prepare(
      `UPDATE seats SET status = 'active', user_id = ?
       WHERE status = 'invited' AND email = (SELECT email FROM users WHERE id = ?)`,
    )
    .bind(userId, userId)
    .run();
}

function mapSeatRowToDto(row: SeatRow): SeatDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}
