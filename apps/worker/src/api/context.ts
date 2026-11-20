import type { BrandDto } from "@inboxsieve/contract";

import type { Deps } from "../deps";
import { HttpError } from "../http";
import { getBrand, type AccountContext } from "../repo";

export type ApiContext = {
  deps: Deps;
  account: AccountContext;
};

export type PublicContext = {
  deps: Deps;
};

export async function requireBrand({
  deps,
  account,
  brandId,
}: ApiContext & { brandId: string | undefined }): Promise<BrandDto> {
  const brand = brandId ? await getBrand({ db: deps.db, accountId: account.accountId, brandId }) : null;

  if (!brand) {
    throw new HttpError(404, "not_found", "Brand not found");
  }
  return brand;
}

export function readParam({ params, key }: { params: Record<string, string>; key: string }) {
  const value = params[key];

  if (!value) {
    throw new HttpError(404, "not_found", "Not found");
  }
  return value;
}

export function createEnumGuard<T extends string>(options: Record<T, unknown>) {
  return (value: unknown): value is T => {
    return typeof value === "string" && Object.hasOwn(options, value);
  };
}
