import type { BrandDto, BusinessProfile, Plan, ProfileDto } from "@inboxsieve/contract";

import { DEFAULT_PROFILE } from "../analysis/analyzer";
import { newId } from "../ids";

type BrandRow = {
  id: string;
  account_id: string;
  name: string;
  profile: string | null;
  alert_threshold: number;
  created_at: string;
};

export async function listBrands({ db, accountId }: { db: D1Database; accountId: string }) {
  const { results } = await db
    .prepare("SELECT * FROM brands WHERE account_id = ? ORDER BY created_at, id")
    .bind(accountId)
    .all<BrandRow>();
  return results.map(mapBrandRowToDto);
}

export async function getBrand({ db, accountId, brandId }: { db: D1Database; accountId: string; brandId: string }) {
  const row = await db
    .prepare("SELECT * FROM brands WHERE id = ? AND account_id = ?")
    .bind(brandId, accountId)
    .first<BrandRow>();
  return row ? mapBrandRowToDto(row) : null;
}

export async function countBrands({ db, accountId }: { db: D1Database; accountId: string }) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM brands WHERE account_id = ?")
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createBrand({
  db,
  accountId,
  name,
  now,
}: {
  db: D1Database;
  accountId: string;
  name: string;
  now: Date;
}) {
  const row = await db
    .prepare("INSERT INTO brands (id, account_id, name, created_at) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(newId(), accountId, name, now.toISOString())
    .first<BrandRow>();
  return row ? mapBrandRowToDto(row) : null;
}

export async function renameBrand({
  db,
  accountId,
  brandId,
  name,
}: {
  db: D1Database;
  accountId: string;
  brandId: string;
  name: string;
}) {
  const row = await db
    .prepare("UPDATE brands SET name = ? WHERE id = ? AND account_id = ? RETURNING *")
    .bind(name, brandId, accountId)
    .first<BrandRow>();
  return row ? mapBrandRowToDto(row) : null;
}

export async function getBrandProfile({ db, brandId }: { db: D1Database; brandId: string }) {
  const row = await db
    .prepare("SELECT profile FROM brands WHERE id = ?")
    .bind(brandId)
    .first<{ profile: string | null }>();

  if (!row) {
    return null;
  }
  return mapProfileColumnToDto(row.profile);
}

export async function saveBrandProfile({
  db,
  accountId,
  brandId,
  profile,
}: {
  db: D1Database;
  accountId: string;
  brandId: string;
  profile: BusinessProfile;
}) {
  const row = await db
    .prepare("UPDATE brands SET profile = ? WHERE id = ? AND account_id = ? RETURNING profile")
    .bind(JSON.stringify(profile), brandId, accountId)
    .first<{ profile: string | null }>();
  return row ? mapProfileColumnToDto(row.profile) : null;
}

function mapBrandRowToDto(row: BrandRow): BrandDto {
  return {
    id: row.id,
    name: row.name,
    profileState: row.profile ? "saved" : "defaults",
    alertThreshold: row.alert_threshold,
    createdAt: row.created_at,
  };
}

function mapProfileColumnToDto(profile: string | null): ProfileDto {
  if (!profile) {
    return {
      state: "defaults",
      profile: DEFAULT_PROFILE,
    };
  }
  const saved: BusinessProfile = JSON.parse(profile);
  return {
    state: "saved",
    profile: saved,
  };
}

export async function getBrandOwner({ db, brandId }: { db: D1Database; brandId: string }) {
  return db
    .prepare(
      "SELECT b.account_id AS accountId, a.plan FROM brands b JOIN accounts a ON a.id = b.account_id WHERE b.id = ?",
    )
    .bind(brandId)
    .first<{ accountId: string; plan: Plan }>();
}
