import { beforeAll, describe, expect, it } from 'vitest';

import { admitLead } from '../src/leads/pipeline';
import * as repo from '../src/repo';
import { db, seedAccount, seedSource } from './helpers';

type Tenant = Awaited<ReturnType<typeof seedTenant>>;

// Entry points that resolve the tenant from a secret or the session instead of taking one.
const TENANT_RESOLVERS = new Set([
  'getAccountContext',
  'createAccount',
  'setSubscription',
  'getAccountPlan',
  'findSourceByAddress',
  'findSourceByToken',
  'getBrandOwner',
  'listDueLeads',
  'requeueStaleLeads',
  'insertEvent',
  'insertLead',
  'mapSourceRowToDto',
  'mapLeadRowToSummary',
  'mapLeadRowToDetail',
]);

const NOW = new Date('2026-11-20T10:00:00.000Z');

async function seedTenant() {
  const account = await seedAccount();
  const source = await seedSource({ brandId: account.brandId, kind: 'webhook' });
  await repo.saveBrandProfile({
    db,
    accountId: account.accountId,
    brandId: account.brandId,
    profile: {
      services: `Services of ${account.email}`,
      idealClient: 'x',
      minBudget: 'x',
      tone: 'x',
      signature: 'x',
      bookingLink: '',
    },
  });
  const { leadId } = await admitLead({
    db,
    brandId: account.brandId,
    sourceId: source.id,
    dedupeKey: 'msg:tenant',
    parsed: {
      ok: true,
      lead: {
        name: 'Lee',
        email: 'lee@client.example',
        company: 'Client',
        subject: 'Project',
        message: 'We need a new site, budget $9k.',
      },
    },
    raw: 'raw',
    authResults: null,
    now: NOW,
  });
  await db.prepare(`UPDATE leads SET status = 'analyzed', stage = 'new' WHERE id = ?`).bind(leadId).run();
  await repo.addFeedback({
    db,
    brandId: account.brandId,
    leadId,
    kind: 'wrong_score',
    expectedScore: 90,
    note: '',
    now: NOW,
  });
  return {
    ...account,
    sourceId: source.id,
    leadId,
  };
}

// Each case calls one repository function with tenant A's resource ids but tenant B's brand/account id.
const CASES: Record<string, (a: Tenant, b: Tenant) => Promise<unknown>> = {
  listBrands: async (a, b) => (await repo.listBrands({ db, accountId: b.accountId })).filter((brand) => brand.id === a.brandId),
  getBrand: (a, b) => repo.getBrand({ db, accountId: b.accountId, brandId: a.brandId }),
  countBrands: async (a, b) => (await repo.countBrands({ db, accountId: b.accountId })) - 1,
  createBrand: async (a, b) => {
    const brand = await repo.createBrand({ db, accountId: b.accountId, name: 'B second', now: NOW });
    return (await repo.listBrands({ db, accountId: a.accountId })).filter((item) => item.id === brand?.id);
  },
  getBrandProfile: async (a, b) => {
    const profile = await repo.getBrandProfile({ db, brandId: b.brandId });
    return profile?.profile.services === `Services of ${a.email}` ? profile : null;
  },
  saveBrandProfile: (a, b) =>
    repo.saveBrandProfile({
      db,
      accountId: b.accountId,
      brandId: a.brandId,
      profile: {
        services: 'hijack',
        idealClient: '',
        minBudget: '',
        tone: '',
        signature: '',
        bookingLink: '',
      },
    }),
  createSource: async (a, b) => {
    const source = await repo.createSource({ db, brandId: b.brandId, brandName: 'B', kind: 'email', name: 'B', inboundDomain: 'in.example', now: NOW });
    return (await repo.listSources({ db, brandId: a.brandId })).filter((item) => item.id === source?.id);
  },
  listSources: async (a, b) => (await repo.listSources({ db, brandId: b.brandId })).filter((source) => source.id === a.sourceId),
  getSource: (a, b) => repo.getSource({ db, brandId: b.brandId, sourceId: a.sourceId }),
  countAccountSources: async (a, b) => {
    const before = await repo.countAccountSources({ db, accountId: b.accountId });
    await seedSource({ brandId: a.brandId, kind: 'email' });
    return (await repo.countAccountSources({ db, accountId: b.accountId })) - before;
  },
  updateSourceState: (a, b) => repo.updateSourceState({ db, brandId: b.brandId, sourceId: a.sourceId, state: 'disabled', now: NOW }),
  renameSource: (a, b) => repo.renameSource({ db, brandId: b.brandId, sourceId: a.sourceId, name: 'hijack', now: NOW }),
  rotateSourceToken: (a, b) => repo.rotateSourceToken({ db, brandId: b.brandId, sourceId: a.sourceId, now: NOW }),
  deleteSource: async (a, b) => (await repo.deleteSource({ db, brandId: b.brandId, sourceId: a.sourceId })) || null,
  findLeadIdByDedupeKey: (_a, b) => repo.findLeadIdByDedupeKey({ db, brandId: b.brandId, dedupeKey: 'msg:tenant-a-only' }),
  transitionLead: (a, b) => repo.transitionLead({ db, brandId: b.brandId, leadId: a.leadId, from: 'analyzed', to: 'queued', now: NOW }),
  claimLead: (a, b) => repo.claimLead({ db, brandId: b.brandId, leadId: a.leadId, now: NOW }),
  queueRescore: async (a, b) => {
    await repo.queueRescore({ db, brandId: b.brandId, limit: 50, now: NOW });
    return (await repo.getLead({ db, brandId: a.brandId, leadId: a.leadId }))?.status === 'queued' ? 'touched' : null;
  },
  countMonthlyLeads: async (a, b) => {
    const before = await repo.countMonthlyLeads({ db, accountId: b.accountId, monthStart: new Date('2026-11-01') });
    await db.prepare('UPDATE leads SET counts_to_quota = 1 WHERE id = ?').bind(a.leadId).run();
    return (await repo.countMonthlyLeads({ db, accountId: b.accountId, monthStart: new Date('2026-11-01') })) - before;
  },
  listLeads: (a, b) =>
    repo
      .listLeads({
        db,
        brandId: b.brandId,
        filters: { scoreMin: null, scoreMax: null, category: null, stage: null, status: null, query: null, before: null, limit: 100 },
      })
      .then((leads) => leads.filter((lead) => lead.id === a.leadId)),
  getLead: (a, b) => repo.getLead({ db, brandId: b.brandId, leadId: a.leadId }),
  listLeadEvents: (a, b) => repo.listLeadEvents({ db, brandId: b.brandId, leadId: a.leadId }),
  updateLeadStage: (a, b) => repo.updateLeadStage({ db, brandId: b.brandId, leadId: a.leadId, from: 'new', to: 'contacted', now: NOW }),
  updateLeadDraft: (a, b) => repo.updateLeadDraft({ db, brandId: b.brandId, leadId: a.leadId, draft: 'hijack', now: NOW }),
  markLeadReplied: (a, b) => repo.markLeadReplied({ db, brandId: b.brandId, leadId: a.leadId, now: NOW }),
  countSourceLeads: (a, b) => repo.countSourceLeads({ db, brandId: b.brandId, sourceId: a.sourceId }),
  addFeedback: (a, b) =>
    repo.addFeedback({ db, brandId: b.brandId, leadId: a.leadId, kind: 'not_spam', expectedScore: null, note: '', now: NOW }),
  listFeedbackExamples: (_a, b) => repo.listFeedbackExamples({ db, brandId: b.brandId }),
};

function isEmpty(value: unknown) {
  return value === null || value === 0 || (Array.isArray(value) && value.length === 0);
}

describe('tenancy', () => {
  let a: Tenant;
  let b: Tenant;
  let snapshot: string;

  beforeAll(async () => {
    a = await seedTenant();
    b = await seedTenant();
    await db.prepare(`DELETE FROM feedback WHERE brand_id = ?`).bind(b.brandId).run();
    snapshot = await readTenantRows(a);
  });

  it('tenancy: every repository function that takes a tenant has a wrong-id case', () => {
    const scoped = Object.keys(repo).filter((name) => !TENANT_RESOLVERS.has(name));

    expect(scoped.sort()).toEqual(Object.keys(CASES).sort());
  });

  it.each(Object.keys(CASES))('tenancy: %s with the wrong brand/account id returns nothing', async (name) => {
    const result = await CASES[name](a, b);

    expect(isEmpty(result)).toBe(true);
  });

  it("tenancy: wrong-id calls changed none of tenant A's rows", async () => {
    await Promise.all(
      ['saveBrandProfile', 'updateSourceState', 'renameSource', 'rotateSourceToken', 'deleteSource', 'updateLeadStage', 'updateLeadDraft', 'markLeadReplied'].map(
        (name) => CASES[name](a, b),
      ),
    );

    expect(await readTenantRows(a)).toBe(snapshot);
  });
});

async function readTenantRows(tenant: Tenant) {
  const brand = await db.prepare('SELECT name, profile FROM brands WHERE id = ?').bind(tenant.brandId).first();
  const source = await db.prepare('SELECT name, state, token FROM sources WHERE id = ?').bind(tenant.sourceId).first();
  const lead = await db.prepare('SELECT stage, draft, replied_at FROM leads WHERE id = ?').bind(tenant.leadId).first();
  return JSON.stringify({
    brand,
    source,
    lead,
  });
}
