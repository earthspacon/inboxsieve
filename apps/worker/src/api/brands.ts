import { MAX_SCORE, PLAN_LIMITS, type BusinessProfile, type Me, type UsageDto } from "@inboxsieve/contract";

import { SLACK_WEBHOOK_PREFIX } from "../alerts/slack";
import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { RESCORE_LIMIT, runQueues } from "../leads/jobs";
import { admitLead, getMonthStart } from "../leads/pipeline";
import {
  countBrands,
  countMonthlyLeads,
  createBrand,
  getBrandProfile,
  listBrands,
  listSources,
  queueRescore,
  renameBrand,
  saveAlertSettings,
  saveBrandProfile,
} from "../repo";
import { requireBrand, type ApiContext } from "./context";

const NAME_MAX_LENGTH = 80;
const PROFILE_FIELD_MAX_LENGTH = 2000;
const TEST_LEAD = {
  name: "Sam Rivera",
  email: "sam@harborlight.example",
  company: "Harborlight Dental",
  subject: "Test lead: new website for our clinic",
  message:
    "Hi, I run a 3-location dental clinic and we need a new website with online booking. Budget is around $15k and we'd like to launch in 8 weeks. Could we book a call this week?",
};

export const brandRoutes: Route<ApiContext>[] = [
  route("GET", "/api/me", async ({ deps, account }) => {
    const me: Me = {
      user: {
        id: account.userId,
        email: account.email,
      },
      account: {
        id: account.accountId,
        plan: account.plan,
        subscription: account.subscription,
        access: account.access,
      },
      role: account.role,
    };
    return json({
      ...me,
      brands: await listBrands({ db: deps.db, accountId: account.accountId }),
    });
  }),

  route("GET", "/api/brands", async ({ deps, account }) => {
    return json(await listBrands({ db: deps.db, accountId: account.accountId }));
  }),

  route("POST", "/api/brands", async ({ deps, account, request }) => {
    const name = readString({ data: await readJson(request), key: "name", maxLength: NAME_MAX_LENGTH }).trim();

    if (!name) {
      throw new HttpError(400, "invalid_field", '"name" is required');
    }
    if ((await countBrands({ db: deps.db, accountId: account.accountId })) >= PLAN_LIMITS[account.plan].brands) {
      throw new HttpError(403, "plan_limit", "Your plan has no room for another brand");
    }
    return json(await createBrand({ db: deps.db, accountId: account.accountId, name, now: deps.now() }), 201);
  }),

  route("PATCH", "/api/brands/:brandId", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const name = readString({ data: await readJson(request), key: "name", maxLength: NAME_MAX_LENGTH }).trim();

    if (!name) {
      throw new HttpError(400, "invalid_field", '"name" is required');
    }
    return json(await renameBrand({ db: deps.db, accountId: account.accountId, brandId: brand.id, name }));
  }),

  route("POST", "/api/brands/:brandId/test-lead", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const [source] = await listSources({ db: deps.db, brandId: brand.id });

    if (!source) {
      throw new HttpError(409, "no_source", "Connect a source first");
    }
    const result = await admitLead({
      db: deps.db,
      brandId: brand.id,
      sourceId: source.id,
      dedupeKey: null,
      parsed: {
        ok: true,
        lead: TEST_LEAD,
      },
      raw: TEST_LEAD.message,
      authResults: null,
      now: deps.now(),
    });
    deps.schedule(runQueues(deps));
    return json(
      {
        id: result.leadId,
        status: result.status,
      },
      201,
    );
  }),

  route("PATCH", "/api/brands/:brandId/alerts", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const data = await readJson(request);
    const { enabled, threshold, slackWebhookUrl } = data;

    if (typeof enabled !== "boolean") {
      throw new HttpError(400, "invalid_field", '"enabled" must be a boolean');
    }
    if (typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 0 || threshold > MAX_SCORE) {
      throw new HttpError(400, "invalid_field", '"threshold" must be an integer from 0 to 100');
    }
    if (slackWebhookUrl !== undefined && slackWebhookUrl !== null && !isSlackUrlOrEmpty(slackWebhookUrl)) {
      throw new HttpError(400, "invalid_field", `"slackWebhookUrl" must start with ${SLACK_WEBHOOK_PREFIX}`);
    }
    return json(
      await saveAlertSettings({
        db: deps.db,
        accountId: account.accountId,
        brandId: brand.id,
        enabled,
        threshold,
        slackWebhookUrl: typeof slackWebhookUrl === "string" ? slackWebhookUrl.trim() : null,
      }),
    );
  }),

  route("GET", "/api/brands/:brandId/profile", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    return json(await getBrandProfile({ db: deps.db, brandId: brand.id }));
  }),

  route("PUT", "/api/brands/:brandId/profile", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const data = await readJson(request);
    const profile: BusinessProfile = {
      services: readProfileField({ data, key: "services" }),
      idealClient: readProfileField({ data, key: "idealClient" }),
      minBudget: readProfileField({ data, key: "minBudget" }),
      tone: readProfileField({ data, key: "tone" }),
      signature: readProfileField({ data, key: "signature" }),
      bookingLink: readProfileField({ data, key: "bookingLink" }),
    };
    const saved = await saveBrandProfile({
      db: deps.db,
      accountId: account.accountId,
      brandId: brand.id,
      profile,
    });
    return json({
      ...saved,
      rescoreOffered: true,
    });
  }),

  route("POST", "/api/brands/:brandId/rescore", async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const queued = await queueRescore({
      db: deps.db,
      brandId: brand.id,
      limit: RESCORE_LIMIT,
      now: deps.now(),
    });
    deps.schedule(runQueues(deps));
    return json({ queued }, 202);
  }),

  route("GET", "/api/brands/:brandId/usage", async ({ deps, account, params }) => {
    await requireBrand({ deps, account, brandId: params.brandId });
    const monthStart = getMonthStart(deps.now());
    const usage: UsageDto = {
      month: monthStart.toISOString().slice(0, 7),
      used: await countMonthlyLeads({ db: deps.db, accountId: account.accountId, monthStart }),
      limit: PLAN_LIMITS[account.plan].leadsPerMonth,
    };
    return json(usage);
  }),
];

function readProfileField({ data, key }: { data: Record<string, unknown>; key: keyof BusinessProfile }) {
  return readString({ data, key, maxLength: PROFILE_FIELD_MAX_LENGTH }).trim();
}

function isSlackUrlOrEmpty(value: unknown) {
  return typeof value === "string" && (value.trim() === "" || value.trim().startsWith(SLACK_WEBHOOK_PREFIX));
}
