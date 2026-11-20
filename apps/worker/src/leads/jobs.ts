import { AnalysisContract, type Analysis } from "@inboxsieve/contract";

import { DEFAULT_PROFILE, type LeadAnalyzer } from "../analysis/analyzer";
import {
  claimLead,
  getBrandProfile,
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

  try {
    const analysis = await analyzeClaimedLead({ db, analyzer, lead });
    return await transitionLead({
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
        ...getSpamStage({ analysis, lead }),
      },
    });
  } catch (error) {
    const lastError = error instanceof Error ? error.message : "Analysis failed";

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
}

export async function runDueJobs({ db, analyzer, now }: { db: D1Database; analyzer: LeadAnalyzer; now: Date }) {
  await requeueStaleLeads({ db, staleBefore: new Date(now.getTime() - STALE_ANALYZING_MS) });
  const due = await listDueLeads({ db, now, limit: SWEEP_BATCH });
  let processed = 0;

  for (const job of due) {
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

async function analyzeClaimedLead({ db, analyzer, lead }: { db: D1Database; analyzer: LeadAnalyzer; lead: LeadRow }) {
  const saved = await getBrandProfile({ db, brandId: lead.brand_id });
  const examples = await listFeedbackExamples({ db, brandId: lead.brand_id });
  const analysis: unknown = await analyzer.analyze({
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

  if (!AnalysisContract.isData(analysis)) {
    throw new Error(`Analysis does not match the contract: ${AnalysisContract.getErrorMessages(analysis).join("; ")}`);
  }
  const valid: Analysis = analysis;
  return valid;
}

function getSpamStage({ analysis, lead }: { analysis: Analysis; lead: LeadRow }) {
  if (analysis.category === "spam" && lead.stage === "new") {
    return { stage: "spam" as const };
  }
  return {};
}
