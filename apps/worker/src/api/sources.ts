import { PLAN_LIMITS, type SourceKind } from "@inboxsieve/contract";

import { HttpError, json, readJson, readString, route, type Route } from "../http";
import {
  countAccountSources,
  countSourceLeads,
  createSource,
  deleteSource,
  getSource,
  listSources,
  mapSourceRowToDto,
  renameSource,
  rotateSourceToken,
  updateSourceState,
  type SourceRow,
} from "../repo";
import { createEnumGuard, readParam, requireBrand, type ApiContext } from "./context";

const NAME_MAX_LENGTH = 80;
const SOURCE_KINDS: Record<SourceKind, true> = {
  email: true,
  webhook: true,
};

const isSourceKind = createEnumGuard(SOURCE_KINDS);

export const sourceRoutes: Route<ApiContext>[] = [
  route("GET", "/api/brands/:brandId/sources", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const rows = await listSources({ db: deps.db, brandId: brand.id });
    return json(
      rows.map((row) => {
        return mapSourceRowToDto({ row, appUrl: deps.env.APP_URL });
      }),
    );
  }),

  route("POST", "/api/brands/:brandId/sources", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const data = await readJson(request);
    const name = readString({ data, key: "name", maxLength: NAME_MAX_LENGTH }).trim();

    const kind = data.kind;

    if (!isSourceKind(kind)) {
      throw new HttpError(400, "invalid_field", '"kind" must be "email" or "webhook"');
    }
    const sourceLimit = PLAN_LIMITS[account.plan].sources;

    if (
      sourceLimit !== null &&
      (await countAccountSources({ db: deps.db, accountId: account.accountId })) >= sourceLimit
    ) {
      throw new HttpError(403, "plan_limit", "Your plan has no room for another source");
    }

    const row = await createSource({
      db: deps.db,
      brandId: brand.id,
      brandName: brand.name,
      kind,
      name: name || defaultSourceName(kind),
      inboundDomain: deps.env.INBOUND_DOMAIN,
      now: deps.now(),
    });
    return sourceResponse({ row, appUrl: deps.env.APP_URL, status: 201 });
  }),

  route("PATCH", "/api/brands/:brandId/sources/:sourceId", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const sourceId = readParam({ params, key: "sourceId" });
    const data = await readJson(request);
    let row = await getSource({ db: deps.db, brandId: brand.id, sourceId });

    if (row && data.name !== undefined) {
      const name = readString({ data, key: "name", maxLength: NAME_MAX_LENGTH }).trim();
      row = await renameSource({ db: deps.db, brandId: brand.id, sourceId, name, now: deps.now() });
    }
    if (row && data.enabled !== undefined) {
      if (typeof data.enabled !== "boolean") {
        throw new HttpError(400, "invalid_field", '"enabled" must be a boolean');
      }
      row = await setSourceEnabled({ deps, row, enabled: data.enabled });
    }
    return sourceResponse({ row, appUrl: deps.env.APP_URL });
  }),

  route("POST", "/api/brands/:brandId/sources/:sourceId/rotate-token", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const row = await rotateSourceToken({
      db: deps.db,
      brandId: brand.id,
      sourceId: readParam({ params, key: "sourceId" }),
      now: deps.now(),
    });
    return sourceResponse({ row, appUrl: deps.env.APP_URL });
  }),

  route("DELETE", "/api/brands/:brandId/sources/:sourceId", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const deleted = await deleteSource({
      db: deps.db,
      brandId: brand.id,
      sourceId: readParam({ params, key: "sourceId" }),
    });

    if (!deleted) {
      throw new HttpError(404, "not_found", "Source not found");
    }
    return new Response(null, { status: 204 });
  }),
];

function sourceResponse({ row, appUrl, status = 200 }: { row: SourceRow | null; appUrl: string; status?: number }) {
  if (!row) {
    throw new HttpError(404, "not_found", "Source not found");
  }
  return json(mapSourceRowToDto({ row, appUrl }), status);
}

async function setSourceEnabled({
  deps,
  row,
  enabled,
}: {
  deps: ApiContext["deps"];
  row: SourceRow;
  enabled: boolean;
}) {
  const ref = {
    db: deps.db,
    brandId: row.brand_id,
    sourceId: row.id,
    now: deps.now(),
  };

  if (!enabled) {
    return updateSourceState({ ...ref, state: "disabled" });
  }
  if (row.state !== "disabled") {
    return row;
  }
  const hasLeads = (await countSourceLeads(ref)) > 0;
  return updateSourceState({ ...ref, state: hasLeads ? "connected" : "awaiting_first_message" });
}

function defaultSourceName(kind: SourceKind) {
  const names: Record<SourceKind, string> = {
    email: "Forwarded email",
    webhook: "Website form",
  };
  return names[kind];
}
