import { PLAN_LIMITS, type BusinessProfile, type Me, type UsageDto } from '@inboxsieve/contract';

import { HttpError, json, readJson, readString, route, type Route } from '../http';
import { RESCORE_LIMIT, runDueJobs } from '../leads/jobs';
import { getMonthStart } from '../leads/pipeline';
import { countBrands, countMonthlyLeads, createBrand, getBrandProfile, listBrands, queueRescore, saveBrandProfile } from '../repo';
import { requireBrand, type ApiContext } from './context';

const NAME_MAX_LENGTH = 80;
const PROFILE_FIELD_MAX_LENGTH = 2000;

export const brandRoutes: Route<ApiContext>[] = [
  route('GET', '/api/me', async ({ deps, account }) => {
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

  route('GET', '/api/brands', async ({ deps, account }) => {
    return json(await listBrands({ db: deps.db, accountId: account.accountId }));
  }),

  route('POST', '/api/brands', async ({ deps, account, request }) => {
    const name = readString({ data: await readJson(request), key: 'name', maxLength: NAME_MAX_LENGTH }).trim();

    if (!name) {
      throw new HttpError(400, 'invalid_field', '"name" is required');
    }
    if ((await countBrands({ db: deps.db, accountId: account.accountId })) >= PLAN_LIMITS[account.plan].brands) {
      throw new HttpError(403, 'plan_limit', 'Your plan has no room for another brand');
    }
    return json(await createBrand({ db: deps.db, accountId: account.accountId, name, now: deps.now() }), 201);
  }),

  route('GET', '/api/brands/:brandId/profile', async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    return json(await getBrandProfile({ db: deps.db, brandId: brand.id }));
  }),

  route('PUT', '/api/brands/:brandId/profile', async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const data = await readJson(request);
    const profile: BusinessProfile = {
      services: readProfileField({ data, key: 'services' }),
      idealClient: readProfileField({ data, key: 'idealClient' }),
      minBudget: readProfileField({ data, key: 'minBudget' }),
      tone: readProfileField({ data, key: 'tone' }),
      signature: readProfileField({ data, key: 'signature' }),
      bookingLink: readProfileField({ data, key: 'bookingLink' }),
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

  route('POST', '/api/brands/:brandId/rescore', async ({ deps, account, params }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const queued = await queueRescore({
      db: deps.db,
      brandId: brand.id,
      limit: RESCORE_LIMIT,
      now: deps.now(),
    });
    deps.schedule(runDueJobs({ db: deps.db, analyzer: deps.analyzer, now: deps.now() }));
    return json({ queued }, 202);
  }),

  route('GET', '/api/brands/:brandId/usage', async ({ deps, account, params }) => {
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
