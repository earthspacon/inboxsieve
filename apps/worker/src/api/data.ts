import { DELETE_ACCOUNT_CONFIRMATION } from "@inboxsieve/contract";

import { cancelSubscriptionNow } from "../billing/paddle-api";
import { buildLeadsCsv } from "../data/csv";
import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { countBrands, deleteBrand, getBillingRow, listLeadsForExport, requestAccountDeletion } from "../repo";
import { requireBrand, requireOwner, type ApiContext } from "./context";

const CONFIRM_MAX_LENGTH = 120;

export const dataRoutes: Route<ApiContext>[] = [
  route("GET", "/api/brands/:brandId/export.csv", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const csv = buildLeadsCsv(await listLeadsForExport({ db: deps.db, brandId: brand.id }));
    const filename = `inboxsieve-${brand.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-leads.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }),

  route("DELETE", "/api/brands/:brandId", async ({ deps, account, params, request }) => {
    requireOwner(account);
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const confirm = readString({ data: await readJson(request), key: "confirm", maxLength: CONFIRM_MAX_LENGTH });

    if (confirm !== brand.name) {
      throw new HttpError(400, "invalid_field", "Type the brand name to confirm");
    }
    if ((await countBrands({ db: deps.db, accountId: account.accountId })) <= 1) {
      throw new HttpError(409, "last_brand", "A workspace needs at least one brand. Delete the workspace instead");
    }
    await deleteBrand({ db: deps.db, accountId: account.accountId, brandId: brand.id });
    return new Response(null, { status: 204 });
  }),

  route("DELETE", "/api/account", async ({ deps, account, request }) => {
    requireOwner(account);
    const confirm = readString({ data: await readJson(request), key: "confirm", maxLength: CONFIRM_MAX_LENGTH });

    if (confirm !== DELETE_ACCOUNT_CONFIRMATION) {
      throw new HttpError(400, "invalid_field", `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm`);
    }
    const billing = await getBillingRow({ db: deps.db, accountId: account.accountId });
    if (billing?.paddle_subscription_id && deps.env.PADDLE_API_KEY && billing.status !== "expired") {
      await cancelSubscriptionNow({
        env: deps.env,
        apiKey: deps.env.PADDLE_API_KEY,
        subscriptionId: billing.paddle_subscription_id,
      });
    }
    await requestAccountDeletion({ db: deps.db, accountId: account.accountId, now: deps.now() });
    return json({ scheduled: true }, 202);
  }),
];
