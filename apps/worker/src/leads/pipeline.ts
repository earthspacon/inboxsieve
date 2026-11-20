import { PLAN_LIMITS, type LeadInput, type LeadStatus } from '@inboxsieve/contract';

import { buildSpamAnalysis, isRuleSpam } from '../analysis/rules';
import { countMonthlyLeads, findLeadIdByDedupeKey, getBrandOwner, insertLead, transitionLead } from '../repo';

export type ParsedLead = { ok: true; lead: LeadInput } | { ok: false; error: string };

export type AdmitResult = {
  leadId: string;
  status: LeadStatus;
  duplicate: boolean;
};

const RAW_MAX_CHARS = 1_000_000;

export async function admitLead({
  db,
  brandId,
  sourceId,
  dedupeKey,
  parsed,
  raw,
  authResults,
  now,
}: {
  db: D1Database;
  brandId: string;
  sourceId: string;
  dedupeKey: string | null;
  parsed: ParsedLead;
  raw: string;
  authResults: string | null;
  now: Date;
}): Promise<AdmitResult> {
  const leadId = await insertLead({
    db,
    brandId,
    sourceId,
    dedupeKey,
    lead: parsed.ok ? parsed.lead : EMPTY_LEAD,
    raw: raw.slice(0, RAW_MAX_CHARS),
    authResults,
    now,
  });

  if (!leadId) {
    return {
      leadId: (dedupeKey && (await findLeadIdByDedupeKey({ db, brandId, dedupeKey }))) || '',
      status: 'received',
      duplicate: true,
    };
  }

  const step = {
    db,
    brandId,
    leadId,
    now,
  };

  if (!parsed.ok) {
    await transitionLead({
      ...step,
      from: 'received',
      to: 'parse_failed',
      set: { last_error: parsed.error },
    });
    return {
      leadId,
      status: 'parse_failed',
      duplicate: false,
    };
  }

  await transitionLead({
    ...step,
    from: 'received',
    to: 'parsed',
  });
  const status = await routeParsedLead({
    ...step,
    lead: parsed.lead,
  });
  return {
    leadId,
    status,
    duplicate: false,
  };
}

export async function queueForAnalysis({
  db,
  brandId,
  leadId,
  from,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  from: LeadStatus;
  now: Date;
}): Promise<'queued' | 'over_quota'> {
  const step = {
    db,
    brandId,
    leadId,
    from,
    now,
  };
  const owner = await getBrandOwner({ db, brandId });
  const used = owner ? await countMonthlyLeads({ db, accountId: owner.accountId, monthStart: getMonthStart(now) }) : 0;

  if (!owner || used >= PLAN_LIMITS[owner.plan].leadsPerMonth) {
    await transitionLead({
      ...step,
      to: 'over_quota',
    });
    return 'over_quota';
  }

  await transitionLead({
    ...step,
    to: 'queued',
    set: {
      counts_to_quota: 1,
      next_attempt_at: now.toISOString(),
    },
  });
  return 'queued';
}

export function getMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const EMPTY_LEAD: LeadInput = {
  name: '',
  email: '',
  company: '',
  subject: '',
  message: '',
};

async function routeParsedLead({
  db,
  brandId,
  leadId,
  lead,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  lead: LeadInput;
  now: Date;
}): Promise<LeadStatus> {
  const step = {
    db,
    brandId,
    leadId,
    now,
    from: 'parsed' as const,
  };

  if (isRuleSpam(lead)) {
    const analysis = buildSpamAnalysis();
    await transitionLead({
      ...step,
      to: 'spam_filtered',
      set: {
        stage: 'spam',
        analysis: JSON.stringify(analysis),
        score: analysis.score,
        category: analysis.category,
      },
    });
    return 'spam_filtered';
  }

  return queueForAnalysis(step);
}
