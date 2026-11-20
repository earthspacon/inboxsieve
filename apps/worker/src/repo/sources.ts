import type { SourceDto, SourceKind, SourceState } from "@inboxsieve/contract";

import { newForwardingAddress, newId, newWebhookToken } from "../ids";

export type SourceRow = {
  id: string;
  brand_id: string;
  kind: SourceKind;
  name: string;
  state: SourceState;
  address: string | null;
  token: string | null;
  last_error: string | null;
  verification_link: string | null;
  verification_code: string | null;
  created_at: string;
  updated_at: string;
};

export async function createSource({
  db,
  brandId,
  brandName,
  kind,
  name,
  inboundDomain,
  now,
}: {
  db: D1Database;
  brandId: string;
  brandName: string;
  kind: SourceKind;
  name: string;
  inboundDomain: string;
  now: Date;
}) {
  const address = kind === "email" ? newForwardingAddress({ brandName, domain: inboundDomain }) : null;
  const token = kind === "webhook" ? newWebhookToken() : null;
  const at = now.toISOString();

  return db
    .prepare(
      `INSERT INTO sources (id, brand_id, kind, name, state, address, token, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'awaiting_first_message', ?, ?, ?, ?) RETURNING *`,
    )
    .bind(newId(), brandId, kind, name, address, token, at, at)
    .first<SourceRow>();
}

export async function listSources({ db, brandId }: { db: D1Database; brandId: string }) {
  const { results } = await db
    .prepare("SELECT * FROM sources WHERE brand_id = ? ORDER BY created_at, id")
    .bind(brandId)
    .all<SourceRow>();
  return results;
}

export async function getSource({ db, brandId, sourceId }: { db: D1Database; brandId: string; sourceId: string }) {
  return db.prepare("SELECT * FROM sources WHERE id = ? AND brand_id = ?").bind(sourceId, brandId).first<SourceRow>();
}

export async function countAccountSources({ db, accountId }: { db: D1Database; accountId: string }) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM sources s JOIN brands b ON b.id = s.brand_id WHERE b.account_id = ?")
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Ingress entry points: the secret address/token is what identifies the brand.
export async function findSourceByAddress({ db, address }: { db: D1Database; address: string }) {
  return db.prepare("SELECT * FROM sources WHERE address = ?").bind(address.toLowerCase()).first<SourceRow>();
}

export async function findSourceByToken({ db, token }: { db: D1Database; token: string }) {
  return db.prepare("SELECT * FROM sources WHERE token = ?").bind(token).first<SourceRow>();
}

export async function updateSourceState({
  db,
  brandId,
  sourceId,
  state,
  lastError = null,
  verification = null,
  now,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
  state: SourceState;
  lastError?: string | null;
  verification?: { link: string | null; code: string | null } | null;
  now: Date;
}) {
  return db
    .prepare(
      `UPDATE sources SET state = ?, last_error = ?, verification_link = ?, verification_code = ?, updated_at = ?
       WHERE id = ? AND brand_id = ? RETURNING *`,
    )
    .bind(
      state,
      lastError,
      verification?.link ?? null,
      verification?.code ?? null,
      now.toISOString(),
      sourceId,
      brandId,
    )
    .first<SourceRow>();
}

export async function renameSource({
  db,
  brandId,
  sourceId,
  name,
  now,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
  name: string;
  now: Date;
}) {
  return db
    .prepare("UPDATE sources SET name = ?, updated_at = ? WHERE id = ? AND brand_id = ? RETURNING *")
    .bind(name, now.toISOString(), sourceId, brandId)
    .first<SourceRow>();
}

export async function rotateSourceToken({
  db,
  brandId,
  sourceId,
  now,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
  now: Date;
}) {
  return db
    .prepare(
      `UPDATE sources SET token = ?, updated_at = ? WHERE id = ? AND brand_id = ? AND kind = 'webhook' RETURNING *`,
    )
    .bind(newWebhookToken(), now.toISOString(), sourceId, brandId)
    .first<SourceRow>();
}

export async function deleteSource({ db, brandId, sourceId }: { db: D1Database; brandId: string; sourceId: string }) {
  const row = await db
    .prepare("DELETE FROM sources WHERE id = ? AND brand_id = ? RETURNING id")
    .bind(sourceId, brandId)
    .first<{ id: string }>();
  return row !== null;
}

export function mapSourceRowToDto({ row, appUrl }: { row: SourceRow; appUrl: string }): SourceDto {
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind,
    name: row.name,
    state: row.state,
    address: row.address,
    webhookUrl: row.token ? `${appUrl}/h/${row.token}` : null,
    lastError: row.last_error,
    verification: mapVerification(row),
    createdAt: row.created_at,
  };
}

function mapVerification(row: SourceRow) {
  if (row.state !== "verification_pending") {
    return null;
  }
  return {
    link: row.verification_link,
    code: row.verification_code,
  };
}
