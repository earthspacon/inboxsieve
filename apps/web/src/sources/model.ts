import { PLAN_LIMITS, type SourceDto, type SourceKind } from "@inboxsieve/contract";
import { combine, createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { $plan } from "../session/model";
import { apiCommand, apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

type BrandParams = { brandId: string };
type SourceParams = { brandId: string; sourceId: string };

export const SourcesGate = createGate<BrandParams>();

export const sourceCreateClicked = createEvent<SourceKind>();
export const sourceToggled = createEvent<{ sourceId: string; enabled: boolean }>();
export const tokenRotateClicked = createEvent<string>();
export const sourceDeleteClicked = createEvent<string>();
export const addressCopied = createEvent<string>();

export const sourcesRemote = createRemote({
  handler: ({ brandId }: BrandParams) => {
    return apiRequest<SourceDto[]>({ path: `/api/brands/${brandId}/sources` });
  },
  initial: [],
});

const CREATED_TOAST: Record<SourceKind, string> = {
  email: "Forwarding address added",
  webhook: "Webhook added",
};

// Brands are capped at 1 on every plan, so the brand's sources are the account's sources.
export const $sourceLimit = $plan.map((plan) => {
  return plan ? PLAN_LIMITS[plan].sources : null;
});

export const $sourceCount = sourcesRemote.$data.map((sources) => sources.length);

export const $isAtSourceLimit = combine($sourceCount, $sourceLimit, (count, limit) => {
  return limit !== null && count >= limit;
});

export const $creatingKind = createStore<SourceKind | null>(null);
const $createdSourceId = createStore<string | null>(null);

export const createSourceFx = createEffect(({ brandId, kind }: BrandParams & { kind: SourceKind }) => {
  return apiRequest<SourceDto>({
    path: `/api/brands/${brandId}/sources`,
    method: "POST",
    body: {
      kind,
      name: "",
    },
  });
});

const toggleSourceFx = createEffect(({ brandId, sourceId, enabled }: SourceParams & { enabled: boolean }) => {
  return apiRequest<SourceDto>({
    path: `/api/brands/${brandId}/sources/${sourceId}`,
    method: "PATCH",
    body: { enabled },
  });
});

const rotateTokenFx = createEffect(({ brandId, sourceId }: SourceParams) => {
  return apiRequest<SourceDto>({
    path: `/api/brands/${brandId}/sources/${sourceId}/rotate-token`,
    method: "POST",
  });
});

const deleteSourceFx = createEffect(({ brandId, sourceId }: SourceParams) => {
  return apiCommand({
    path: `/api/brands/${brandId}/sources/${sourceId}`,
    method: "DELETE",
  });
});

const copyFx = createEffect((text: string) => {
  return navigator.clipboard.writeText(text);
});

// A new card lands at the end of the list, below the fold on a phone: bring it into view.
const scrollToSourceFx = createEffect((sourceId: string) => {
  requestAnimationFrame(() => {
    document.getElementById(`source-${sourceId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// #region load
sample({
  clock: [
    SourcesGate.open,
    SourcesGate.state.updates,
    createSourceFx.done,
    toggleSourceFx.done,
    rotateTokenFx.done,
    deleteSourceFx.done,
  ],
  source: SourcesGate.state,
  filter: (params) => Boolean(params.brandId),
  target: sourcesRemote.fx,
});
// #endregion

// #region actions
sample({
  clock: sourceCreateClicked,
  source: SourcesGate.state,
  fn: ({ brandId }, kind) => {
    return {
      brandId,
      kind,
    };
  },
  target: createSourceFx,
});

sample({
  clock: sourceCreateClicked,
  target: $creatingKind,
});

sample({
  clock: createSourceFx.finally,
  target: $creatingKind.reinit,
});

sample({
  clock: createSourceFx.doneData,
  fn: (source) => source.id,
  target: $createdSourceId,
});

sample({
  clock: createSourceFx.doneData,
  fn: (source) => {
    return {
      text: CREATED_TOAST[source.kind],
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: sourcesRemote.fx.done,
  source: $createdSourceId,
  filter: Boolean,
  target: [scrollToSourceFx, $createdSourceId.reinit],
});

sample({
  clock: sourceToggled,
  source: SourcesGate.state,
  fn: ({ brandId }, change) => {
    return {
      brandId,
      ...change,
    };
  },
  target: toggleSourceFx,
});

sample({
  clock: tokenRotateClicked,
  source: SourcesGate.state,
  fn: ({ brandId }, sourceId) => {
    return {
      brandId,
      sourceId,
    };
  },
  target: rotateTokenFx,
});

sample({
  clock: sourceDeleteClicked,
  source: SourcesGate.state,
  fn: ({ brandId }, sourceId) => {
    return {
      brandId,
      sourceId,
    };
  },
  target: deleteSourceFx,
});

sample({
  clock: addressCopied,
  target: copyFx,
});

sample({
  clock: copyFx.done,
  fn: () => {
    return {
      text: "Copied",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: rotateTokenFx.done,
  fn: () => {
    return {
      text: "New webhook URL ready. The old one stopped working.",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: [createSourceFx.failData, toggleSourceFx.failData, rotateTokenFx.failData, deleteSourceFx.failData],
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
// #endregion
