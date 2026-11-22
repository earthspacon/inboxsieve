import type { LeadDetailDto, LeadStage, LeadStageCountsDto, LeadSummaryDto, SourceDto } from "@inboxsieve/contract";
import { combine, createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { meRefreshRequested } from "../session/model";
import { apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";
import { buildLeadsQuery, DEFAULT_FILTERS, getInboxEmptyState, type LeadFilters } from "./lib";

type BrandParams = { brandId: string };
type LeadParams = { brandId: string; leadId: string };

type LeadAction =
  | { kind: "draft"; draft: string }
  | { kind: "replied" }
  | { kind: "stage"; stage: LeadStage }
  | { kind: "not_spam" }
  | { kind: "retry" };

const ACTION_TOASTS: Record<LeadAction["kind"], string> = {
  draft: "Draft saved",
  replied: "Marked as replied",
  stage: "Stage updated",
  not_spam: "Moved to New. We'll learn from it.",
  retry: "Queued for another try",
};
const PENDING_STATUSES = new Set(["received", "parsed", "queued", "analyzing"]);
const REFRESH_DELAY_MS = 2000;

export const InboxGate = createGate<BrandParams>();
export const LeadGate = createGate<LeadParams>();
export const PipelineGate = createGate<BrandParams>();

export const filtersChanged = createEvent<Partial<LeadFilters>>();
export const filtersReset = createEvent();
export const testLeadClicked = createEvent();
export const draftEdited = createEvent<string>();
export const draftSaveClicked = createEvent();
export const draftCopied = createEvent();
export const repliedClicked = createEvent();
export const stageChosen = createEvent<LeadStage>();
export const notSpamClicked = createEvent();
export const wrongScoreSubmitted = createEvent<{ expectedScore: number; note: string }>();
export const retryClicked = createEvent();
export const pipelineMoveChosen = createEvent<{ leadId: string; stage: LeadStage }>();

export const $filters = createStore<LeadFilters>(DEFAULT_FILTERS);
export const $draft = createStore("");

export const inboxRemote = createRemote({
  handler: ({ brandId, filters }: BrandParams & { filters: LeadFilters }) => {
    return apiRequest<LeadSummaryDto[]>({ path: `/api/brands/${brandId}/leads?${buildLeadsQuery(filters)}` });
  },
  initial: [],
});

export const inboxSourcesRemote = createRemote({
  handler: ({ brandId }: BrandParams) => {
    return apiRequest<SourceDto[]>({ path: `/api/brands/${brandId}/sources` });
  },
  initial: [],
});

export const stageCountsRemote = createRemote<BrandParams, LeadStageCountsDto | null>({
  handler: ({ brandId }) => {
    return apiRequest<LeadStageCountsDto>({ path: `/api/brands/${brandId}/stage-counts` });
  },
  initial: null,
});

export const leadRemote = createRemote<LeadParams, LeadDetailDto | null>({
  handler: ({ brandId, leadId }) => {
    return apiRequest<LeadDetailDto>({ path: `/api/brands/${brandId}/leads/${leadId}` });
  },
  initial: null,
});

export const pipelineRemote = createRemote({
  handler: ({ brandId }: BrandParams) => {
    return apiRequest<LeadSummaryDto[]>({ path: `/api/brands/${brandId}/leads?limit=100` });
  },
  initial: [],
});

export const $inboxEmptyState = combine(
  inboxRemote.$data,
  inboxSourcesRemote.$data,
  $filters,
  (leads, sources, filters) => {
    return getInboxEmptyState({
      sourceCount: sources.length,
      leadCount: leads.length,
      filters,
    });
  },
);

const testLeadFx = createEffect(({ brandId }: BrandParams) => {
  return apiRequest<{ id: string }>({
    path: `/api/brands/${brandId}/test-lead`,
    method: "POST",
  });
});

export const $isTestLeadSending = testLeadFx.pending;

const waitFx = createEffect(() => {
  return new Promise((resolve) => {
    setTimeout(resolve, REFRESH_DELAY_MS);
  });
});

const leadActionFx = createEffect(({ brandId, leadId, action }: LeadParams & { action: LeadAction }) => {
  const base = `/api/brands/${brandId}/leads/${leadId}`;
  const requests: Record<LeadAction["kind"], () => Promise<LeadDetailDto>> = {
    draft: () => {
      return apiRequest({ path: `${base}/draft`, method: "PUT", body: action });
    },
    replied: () => {
      return apiRequest({ path: `${base}/replied`, method: "POST" });
    },
    stage: () => {
      return apiRequest({ path: `${base}/stage`, method: "PATCH", body: action });
    },
    not_spam: () => {
      return apiRequest({ path: `${base}/not-spam`, method: "POST" });
    },
    retry: () => {
      return apiRequest({ path: `${base}/retry`, method: "POST" });
    },
  };
  return requests[action.kind]();
});

const feedbackFx = createEffect(
  ({ brandId, leadId, expectedScore, note }: LeadParams & { expectedScore: number; note: string }) => {
    return apiRequest<{ id: string }>({
      path: `/api/brands/${brandId}/leads/${leadId}/feedback`,
      method: "POST",
      body: {
        expectedScore,
        note,
      },
    });
  },
);

const copyFx = createEffect((text: string) => {
  return navigator.clipboard.writeText(text);
});

const pipelineMoveFx = createEffect(({ brandId, leadId, stage }: LeadParams & { stage: LeadStage }) => {
  return apiRequest<LeadDetailDto>({
    path: `/api/brands/${brandId}/leads/${leadId}/stage`,
    method: "PATCH",
    body: { stage },
  });
});

// #region inbox
sample({
  clock: filtersChanged,
  source: $filters,
  fn: (filters, change) => {
    return {
      ...filters,
      ...change,
    };
  },
  target: $filters,
});

sample({
  clock: filtersReset,
  target: $filters.reinit,
});

sample({
  clock: [InboxGate.open, InboxGate.state.updates, $filters, testLeadFx.done, waitFx.done],
  source: {
    params: InboxGate.state,
    filters: $filters,
    isOpen: InboxGate.status,
  },
  filter: ({ params, isOpen }) => isOpen && Boolean(params.brandId),
  fn: ({ params, filters }) => {
    return {
      brandId: params.brandId,
      filters,
    };
  },
  target: inboxRemote.fx,
});

sample({
  clock: [InboxGate.open, InboxGate.state.updates],
  source: InboxGate.state,
  filter: (params) => Boolean(params.brandId),
  target: inboxSourcesRemote.fx,
});

sample({
  clock: inboxRemote.fx.doneData,
  filter: (leads) => {
    return leads.some((lead) => {
      return PENDING_STATUSES.has(lead.status);
    });
  },
  target: waitFx,
});

sample({
  clock: inboxRemote.fx.done,
  fn: ({ params }) => {
    return { brandId: params.brandId };
  },
  target: stageCountsRemote.fx,
});

sample({
  clock: testLeadClicked,
  source: InboxGate.state,
  target: testLeadFx,
});

sample({
  clock: testLeadFx.done,
  fn: () => {
    return {
      text: "Test lead sent. It shows up below in a moment.",
      tone: "success" as const,
    };
  },
  target: [toastShown, meRefreshRequested],
});
// #endregion

// #region lead detail
sample({
  clock: [LeadGate.open, LeadGate.state.updates],
  source: LeadGate.state,
  filter: (params) => Boolean(params.brandId && params.leadId),
  target: leadRemote.fx,
});

sample({
  clock: leadRemote.$data,
  fn: (lead) => lead?.draft ?? "",
  target: $draft,
});

sample({
  clock: draftEdited,
  target: $draft,
});

sample({
  clock: draftSaveClicked,
  source: {
    params: LeadGate.state,
    draft: $draft,
  },
  fn: ({ params, draft }) => {
    return {
      ...params,
      action: {
        kind: "draft" as const,
        draft,
      },
    };
  },
  target: leadActionFx,
});

sample({
  clock: repliedClicked,
  source: LeadGate.state,
  fn: (params) => {
    return {
      ...params,
      action: { kind: "replied" as const },
    };
  },
  target: leadActionFx,
});

sample({
  clock: stageChosen,
  source: LeadGate.state,
  fn: (params, stage) => {
    return {
      ...params,
      action: {
        kind: "stage" as const,
        stage,
      },
    };
  },
  target: leadActionFx,
});

sample({
  clock: notSpamClicked,
  source: LeadGate.state,
  fn: (params) => {
    return {
      ...params,
      action: { kind: "not_spam" as const },
    };
  },
  target: leadActionFx,
});

sample({
  clock: retryClicked,
  source: LeadGate.state,
  fn: (params) => {
    return {
      ...params,
      action: { kind: "retry" as const },
    };
  },
  target: leadActionFx,
});

sample({
  clock: leadActionFx.doneData,
  target: leadRemote.$data,
});

sample({
  clock: leadActionFx.done,
  fn: ({ params }) => {
    return {
      text: ACTION_TOASTS[params.action.kind],
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: wrongScoreSubmitted,
  source: LeadGate.state,
  fn: (params, feedback) => {
    return {
      ...params,
      ...feedback,
    };
  },
  target: feedbackFx,
});

sample({
  clock: feedbackFx.done,
  fn: () => {
    return {
      text: "Thanks. Future scores for this brand will use it.",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: draftCopied,
  source: $draft,
  target: copyFx,
});

sample({
  clock: copyFx.done,
  fn: () => {
    return {
      text: "Draft copied",
      tone: "success" as const,
    };
  },
  target: toastShown,
});
// #endregion

// #region pipeline
sample({
  clock: [PipelineGate.open, PipelineGate.state.updates, pipelineMoveFx.done],
  source: PipelineGate.state,
  filter: (params) => Boolean(params.brandId),
  target: pipelineRemote.fx,
});

sample({
  clock: pipelineMoveChosen,
  source: PipelineGate.state,
  fn: ({ brandId }, move) => {
    return {
      brandId,
      ...move,
    };
  },
  target: pipelineMoveFx,
});
// #endregion

// #region errors
sample({
  clock: [testLeadFx.failData, leadActionFx.failData, feedbackFx.failData, copyFx.failData, pipelineMoveFx.failData],
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
// #endregion
