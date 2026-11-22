import { AnalysisContract, getVerdict, type Analysis } from "@inboxsieve/contract";

import { queueHotLeadAlerts, runAlertDeliveries } from "../alerts/alerts";
import { DEFAULT_PROFILE, type LeadAnalyzer } from "../analysis/analyzer";
import { readLlmBudget, type LlmBudget } from "../analysis/budget";
import { RateLimitedError } from "../analysis/groq";
import type { Deps } from "../deps";
import {
  addLlmSpend,
  claimLead,
  claimLlmCapAlert,
  getBrandOwner,
  getLlmSpend,
  getBrandProfile,
  hasLeftStage,
  hasNotSpamFeedback,
  listDueLeads,
  listFeedbackExamples,
  requeueStaleLeads,
  transitionLead,
  type LeadRow,
} from "../repo";

export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [30_000, 120_000];
export const RESCORE_LIMIT = 50;
const SWEEP_BATCH = 25;
const STALE_ANALYZING_MS = 5 * 60_000;

export async function processLead({
  db,
  analyzer,
  brandId,
  leadId,
  now,
}: {
  db: D1Database;
  analyzer: LeadAnalyzer;
  brandId: string;
  leadId: string;
  now: Date;
}) {
  const lead = await claimLead({ db, brandId, leadId, now });

  if (!lead) {
    return null;
  }

  let analysis: Analysis;
  try {
    analysis = await analyzeClaimedLead({ db, analyzer, lead, now });
  } catch (error) {
    const lastError = error instanceof Error ? error.message : "Analysis failed";

    // A provider rate limit is not the lead's fault: keep it queued and give the attempt back.
    if (error instanceof RateLimitedError) {
      return transitionLead({
        db,
        brandId,
        leadId,
        now,
        from: "analyzing",
        to: "queued",
        set: {
          attempts: lead.attempts - 1,
          last_error: lastError,
          next_attempt_at: new Date(now.getTime() + error.retryAfterMs).toISOString(),
        },
      });
    }

    if (lead.attempts >= MAX_ATTEMPTS) {
      return transitionLead({
        db,
        brandId,
        leadId,
        now,
        from: "analyzing",
        to: "analysis_failed",
        set: { last_error: lastError },
      });
    }
    return transitionLead({
      db,
      brandId,
      leadId,
      now,
      from: "analyzing",
      to: "queued",
      set: {
        last_error: lastError,
        next_attempt_at: new Date(now.getTime() + RETRY_DELAYS_MS[lead.attempts - 1]).toISOString(),
      },
    });
  }

  const analyzed = await transitionLead({
    db,
    brandId,
    leadId,
    now,
    from: "analyzing",
    to: "analyzed",
    set: {
      analysis: JSON.stringify(analysis),
      score: analysis.score,
      category: analysis.category,
      draft: analysis.draftReply,
      analyzed_at: now.toISOString(),
      last_error: null,
      ...getSetAsideStage({
        analysis,
        lead,
        isMarkedNotSpam: await hasNotSpamFeedback({ db, brandId, leadId }),
        isMovedOutOfPitch: await hasLeftStage({ db, brandId, leadId, stage: "pitch" }),
      }),
    },
  });

  if (analyzed) {
    await queueHotLeadAlerts({ db, brandId, leadId, now });
  }
  return analyzed;
}

// One sweep: analysis jobs first, then the hot-lead alerts they queued.
export async function runQueues(deps: Pick<Deps, "db" | "analyzer" | "mailer" | "slack" | "env" | "now">) {
  const processed = await runDueJobs({
    db: deps.db,
    analyzer: deps.analyzer,
    now: deps.now(),
    budget: readLlmBudget({ env: deps.env, mailer: deps.mailer }),
  });
  await runAlertDeliveries({
    db: deps.db,
    channels: {
      mailer: deps.mailer,
      slack: deps.slack,
      appUrl: deps.env.APP_URL,
    },
    now: deps.now(),
  });
  return processed;
}

// Over a daily LLM cap, leads stay `queued` and are picked up again the next UTC day.
export async function runDueJobs({
  db,
  analyzer,
  now,
  budget,
}: {
  db: D1Database;
  analyzer: LeadAnalyzer;
  now: Date;
  budget?: LlmBudget;
}) {
  await requeueStaleLeads({ db, staleBefore: new Date(now.getTime() - STALE_ANALYZING_MS) });
  const due = await listDueLeads({ db, now, limit: SWEEP_BATCH });
  const day = getUtcDay(now);
  let processed = 0;

  for (const job of due) {
    if (budget && (await getLlmSpend({ db, day, accountId: null })) >= budget.dailyCapUsd) {
      await alertCapReached({ db, budget, day, now });
      break;
    }
    if (budget && (await isAccountOverCap({ db, budget, day, brandId: job.brand_id }))) {
      continue;
    }
    const result = await processLead({
      db,
      analyzer,
      brandId: job.brand_id,
      leadId: job.id,
      now,
    });
    if (result) {
      processed += 1;
    }
  }
  return processed;
}

async function analyzeClaimedLead({
  db,
  analyzer,
  lead,
  now,
}: {
  db: D1Database;
  analyzer: LeadAnalyzer;
  lead: LeadRow;
  now: Date;
}) {
  const saved = await getBrandProfile({ db, brandId: lead.brand_id });
  const examples = await listFeedbackExamples({ db, brandId: lead.brand_id });
  const { analysis, costUsd } = await analyzer.analyze({
    lead: {
      name: lead.name,
      email: lead.email,
      company: lead.company,
      subject: lead.subject,
      message: lead.message,
    },
    profile: saved?.profile ?? DEFAULT_PROFILE,
    examples,
  });
  const owner = await getBrandOwner({ db, brandId: lead.brand_id });

  if (owner && costUsd > 0) {
    await addLlmSpend({
      db,
      day: getUtcDay(now),
      accountId: owner.accountId,
      usd: costUsd,
    });
  }
  if (!AnalysisContract.isData(analysis)) {
    throw new Error(`Analysis does not match the contract: ${AnalysisContract.getErrorMessages(analysis).join("; ")}`);
  }
  const valid: Analysis = analysis;
  return valid;
}

// Only a new lead is set aside, and a person's choice beats the model: "Not spam" or a move out of Pitches sticks.
function getSetAsideStage({
  analysis,
  lead,
  isMarkedNotSpam,
  isMovedOutOfPitch,
}: {
  analysis: Analysis;
  lead: LeadRow;
  isMarkedNotSpam: boolean;
  isMovedOutOfPitch: boolean;
}) {
  if (lead.stage !== "new") {
    return {};
  }
  if (analysis.category === "spam" && !isMarkedNotSpam) {
    return { stage: "spam" as const };
  }
  if (getVerdict(analysis) === "pitch" && !isMovedOutOfPitch) {
    return { stage: "pitch" as const };
  }
  return {};
}

async function isAccountOverCap({
  db,
  budget,
  day,
  brandId,
}: {
  db: D1Database;
  budget: LlmBudget;
  day: string;
  brandId: string;
}) {
  const owner = await getBrandOwner({ db, brandId });

  if (!owner) {
    return false;
  }
  return (await getLlmSpend({ db, day, accountId: owner.accountId })) >= budget.accountDailyCapUsd;
}

async function alertCapReached({
  db,
  budget,
  day,
  now,
}: {
  db: D1Database;
  budget: LlmBudget;
  day: string;
  now: Date;
}) {
  if (!(await claimLlmCapAlert({ db, day, now }))) {
    return;
  }
  await budget.alertOwner({
    subject: `InboxSieve: the daily AI budget of $${budget.dailyCapUsd} is used up`,
    text: "Lead analysis is paused until 00:00 UTC. New leads are kept as queued and get analyzed tomorrow.\nRaise LLM_DAILY_USD_CAP if this is real growth; otherwise look for abuse.",
  });
}

export function getUtcDay(now: Date) {
  return now.toISOString().slice(0, 10);
}
