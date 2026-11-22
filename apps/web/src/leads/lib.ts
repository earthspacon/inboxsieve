import { SET_ASIDE_STAGES, type Category, type LeadStage, type LeadStageCountsDto } from "@inboxsieve/contract";

export type LeadFilters = {
  stage: LeadStage | "all";
  category: Category | "all";
  scoreMin: number;
  search: string;
};

export type InboxEmptyState = "no_sources" | "no_leads" | "no_matches" | "no_pitches" | null;

export const DEFAULT_FILTERS: LeadFilters = {
  stage: "all",
  category: "all",
  scoreMin: 0,
  search: "",
};

const LIST_LIMIT = "100";
const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/?view=cm&fs=1";
const OUTLOOK_COMPOSE_URL = "https://outlook.office.com/mail/deeplink/compose";

export function buildLeadsQuery(filters: LeadFilters) {
  const query = new URLSearchParams({ limit: LIST_LIMIT });

  if (filters.stage !== "all") {
    query.set("stage", filters.stage);
  }
  if (filters.category !== "all") {
    query.set("category", filters.category);
  }
  if (filters.scoreMin > 0) {
    query.set("scoreMin", String(filters.scoreMin));
  }
  if (filters.search.trim()) {
    query.set("q", filters.search.trim());
  }
  return query.toString();
}

export function hasActiveFilters(filters: LeadFilters) {
  return buildLeadsQuery(filters) !== buildLeadsQuery(DEFAULT_FILTERS);
}

export function getInboxEmptyState({
  sourceCount,
  leadCount,
  filters,
}: {
  sourceCount: number;
  leadCount: number;
  filters: LeadFilters;
}): InboxEmptyState {
  if (leadCount > 0) {
    return null;
  }
  if (buildLeadsQuery(filters) === buildLeadsQuery({ ...DEFAULT_FILTERS, stage: "pitch" })) {
    return "no_pitches";
  }
  if (hasActiveFilters(filters)) {
    return "no_matches";
  }
  if (sourceCount === 0) {
    return "no_sources";
  }
  return "no_leads";
}

// Only the set-aside tabs carry a count: what got filtered away at a glance.
export function getStageChipCount({ stage, counts }: { stage: LeadStage; counts: LeadStageCountsDto | null }) {
  if (!counts || !SET_ASIDE_STAGES.includes(stage)) {
    return null;
  }
  return counts[stage];
}

export function buildComposeLinks({ to, subject, body }: { to: string; subject: string; body: string }) {
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const mailto = new URLSearchParams({
    subject: replySubject,
    body,
  });
  const gmail = new URLSearchParams({
    to,
    su: replySubject,
    body,
  });
  const outlook = new URLSearchParams({
    to,
    subject: replySubject,
    body,
  });

  return {
    mailto: `mailto:${encodeURIComponent(to)}?${mailto.toString().replaceAll("+", "%20")}`,
    gmail: `${GMAIL_COMPOSE_URL}&${gmail.toString()}`,
    outlook: `${OUTLOOK_COMPOSE_URL}?${outlook.toString()}`,
  };
}
