import { MINUTES_SAVED_PER_LEAD, STAGE_CONFIG, STAGES } from "./config";
import type { Analysis, Lead, Stage } from "./config";

export const WEEKS_ON_CHART = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MINUTES_IN_HOUR = 60;

export function canMoveLead({ lead, stage }: { lead: Lead; stage: Stage }) {
  return STAGE_CONFIG[lead.stage].next.includes(stage);
}

export function moveLead({ lead, stage, at }: { lead: Lead; stage: Stage; at: string }): Lead {
  if (!canMoveLead({ lead, stage })) {
    return lead;
  }
  return {
    ...lead,
    stage,
    history: [...lead.history, { stage, at }],
  };
}

export function approveDraft({ lead, at }: { lead: Lead; at: string }): Lead {
  return moveLead({
    lead,
    stage: "replied",
    at,
  });
}

export function applyAnalysis({ lead, analysis, at }: { lead: Lead; analysis: Analysis; at: string }): Lead {
  const analyzed = {
    ...lead,
    analysis,
    draft: analysis.draftReply,
  };

  if (lead.stage !== "new") {
    return analyzed;
  }
  if (analysis.category === "spam") {
    return moveLead({
      lead: analyzed,
      stage: "lost",
      at,
    });
  }
  if (analysis.category === "hot" || analysis.category === "warm") {
    return moveLead({
      lead: analyzed,
      stage: "qualified",
      at,
    });
  }
  return analyzed;
}

export function getDashboardStats({ leads, now }: { leads: Lead[]; now: number }) {
  const analyzed = leads.filter((lead) => lead.analysis !== null);
  const scored = analyzed.filter((lead) => lead.analysis?.category !== "spam");
  const scoreSum = scored.reduce((sum, lead) => sum + (lead.analysis?.score ?? 0), 0);
  const reached = (stage: Stage) => {
    return leads.filter((lead) => lead.history.some((change) => change.stage === stage)).length;
  };

  return {
    total: leads.length,
    thisWeek: leads.filter((lead) => now - Date.parse(lead.receivedAt) < WEEK_MS).length,
    averageScore: scored.length ? Math.round(scoreSum / scored.length) : 0,
    hoursSaved: Math.round((analyzed.length * MINUTES_SAVED_PER_LEAD) / MINUTES_IN_HOUR),
    spam: analyzed.length - scored.length,
    weekly: getWeeklyCounts({ leads, now }),
    funnel: STAGES.filter((stage) => stage !== "lost").map((stage) => {
      return {
        stage,
        count: reached(stage),
      };
    }),
  };
}

function getWeeklyCounts({ leads, now }: { leads: Lead[]; now: number }) {
  return Array.from({ length: WEEKS_ON_CHART }, (_, index) => {
    const weeksAgo = WEEKS_ON_CHART - 1 - index;
    const from = now - (weeksAgo + 1) * WEEK_MS;
    const to = now - weeksAgo * WEEK_MS;
    const count = leads.filter((lead) => {
      const at = Date.parse(lead.receivedAt);
      return at > from && at <= to;
    }).length;

    return {
      label: weeksAgo === 0 ? "This wk" : `${weeksAgo}w ago`,
      count,
    };
  });
}
