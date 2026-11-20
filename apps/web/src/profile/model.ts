import type { BrandDto, BusinessProfile, ProfileDto, UsageDto } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { $brandId, $me, meFx, meRefreshRequested } from "../session/model";
import { apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

type BrandParams = { brandId: string };

const EMPTY_PROFILE: BusinessProfile = {
  services: "",
  idealClient: "",
  minBudget: "",
  tone: "",
  signature: "",
  bookingLink: "",
};

export const ProfileGate = createGate<BrandParams>();

export const profileFieldChanged = createEvent<Partial<BusinessProfile>>();
export const profileSaveClicked = createEvent();
export const rescoreClicked = createEvent();
export const brandRenameSubmitted = createEvent<string>();

export const profileRemote = createRemote<BrandParams, ProfileDto | null>({
  handler: ({ brandId }) => {
    return apiRequest<ProfileDto>({ path: `/api/brands/${brandId}/profile` });
  },
  initial: null,
});

export const usageRemote = createRemote<BrandParams, UsageDto | null>({
  handler: ({ brandId }) => {
    return apiRequest<UsageDto>({ path: `/api/brands/${brandId}/usage` });
  },
  initial: null,
});

export const saveProfileFx = createEffect(({ brandId, profile }: BrandParams & { profile: BusinessProfile }) => {
  return apiRequest<ProfileDto & { rescoreOffered: boolean }>({
    path: `/api/brands/${brandId}/profile`,
    method: "PUT",
    body: profile,
  });
});

export const renameBrandFx = createEffect(({ brandId, name }: BrandParams & { name: string }) => {
  return apiRequest<BrandDto>({
    path: `/api/brands/${brandId}`,
    method: "PATCH",
    body: { name },
  });
});

const rescoreFx = createEffect(({ brandId }: BrandParams) => {
  return apiRequest<{ queued: number }>({
    path: `/api/brands/${brandId}/rescore`,
    method: "POST",
  });
});

export const $profileForm = createStore<BusinessProfile | null>(null);
export const $isRescoreOffered = createStore(false);

// #region load
sample({
  clock: [ProfileGate.open, ProfileGate.state.updates],
  source: ProfileGate.state,
  filter: (params) => Boolean(params.brandId),
  target: [profileRemote.fx, $isRescoreOffered.reinit],
});

sample({
  clock: profileRemote.$data,
  fn: (data) => data?.profile ?? null,
  target: $profileForm,
});

// Usage is a locked-account 402, so it loads only once the account has access.
sample({
  clock: [$brandId, meFx.doneData],
  source: {
    brandId: $brandId,
    me: $me,
  },
  filter: ({ brandId, me }) => Boolean(brandId) && me?.account.access !== "locked",
  fn: ({ brandId }) => {
    return { brandId };
  },
  target: usageRemote.fx,
});
// #endregion

// #region save
sample({
  clock: profileFieldChanged,
  source: $profileForm,
  filter: Boolean,
  fn: (form, change) => {
    return {
      ...form,
      ...change,
    };
  },
  target: $profileForm,
});

sample({
  clock: profileSaveClicked,
  source: {
    params: ProfileGate.state,
    profile: $profileForm,
  },
  filter: ({ profile }) => profile !== null,
  fn: ({ params, profile }) => {
    return {
      brandId: params.brandId,
      profile: profile ?? EMPTY_PROFILE,
    };
  },
  target: saveProfileFx,
});

sample({
  clock: saveProfileFx.doneData,
  target: profileRemote.$data,
});

sample({
  clock: saveProfileFx.doneData,
  fn: (saved) => saved.rescoreOffered,
  target: $isRescoreOffered,
});

sample({
  clock: [saveProfileFx.done, renameBrandFx.done],
  target: meRefreshRequested,
});

sample({
  clock: saveProfileFx.done,
  fn: () => {
    return {
      text: "Profile saved. New leads are scored against it.",
      tone: "success" as const,
    };
  },
  target: toastShown,
});
// #endregion

// #region rescore
sample({
  clock: rescoreClicked,
  source: ProfileGate.state,
  target: rescoreFx,
});

sample({
  clock: rescoreFx.doneData,
  fn: ({ queued }) => {
    return {
      text: `${queued} leads queued for re-scoring`,
      tone: "success" as const,
    };
  },
  target: [toastShown, $isRescoreOffered.reinit],
});
// #endregion

// #region rename
sample({
  clock: brandRenameSubmitted,
  source: $brandId,
  fn: (brandId, name) => {
    return {
      brandId,
      name,
    };
  },
  target: renameBrandFx,
});
// #endregion

sample({
  clock: [saveProfileFx.failData, renameBrandFx.failData, rescoreFx.failData],
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
