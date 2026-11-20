import type { MeDto } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, combine, sample } from "effector";
import { persist } from "effector-storage/local";

import { apiCommand, apiRequest, ApiRequestError } from "../shared/api";

export type SessionStatus = "loading" | "signed_out" | "no_account" | "error" | "ready";

export const appStarted = createEvent();
export const meRefreshRequested = createEvent();
export const brandSelected = createEvent<string>();
export const signOutClicked = createEvent();

export const meFx = createEffect(async () => {
  // get-session answers 200 null when signed out, so a visitor causes no 401 in the console.
  const session = await apiRequest<{ user: { id: string } } | null>({ path: "/api/auth/get-session" });

  if (!session) {
    throw new ApiRequestError(401, "unauthorized", "Sign in first");
  }
  return apiRequest<MeDto>({ path: "/api/me" });
});

export const signOutFx = createEffect(() => {
  return apiCommand({
    path: "/api/auth/sign-out",
    method: "POST",
    body: {},
  });
});

export const $me = createStore<MeDto | null>(null);
export const $sessionStatus = createStore<SessionStatus>("loading");
export const $sessionError = createStore("");
export const $selectedBrandId = createStore("");

export const $brand = combine($me, $selectedBrandId, (me, brandId) => {
  if (!me) {
    return null;
  }
  return (
    me.brands.find((brand) => {
      return brand.id === brandId;
    }) ??
    me.brands[0] ??
    null
  );
});

export const $brandId = $brand.map((brand) => brand?.id ?? "");
export const $isOwner = $me.map((me) => me?.role === "owner");
export const $plan = $me.map((me) => me?.account.plan ?? null);

// #region load
sample({
  clock: [appStarted, meRefreshRequested],
  target: meFx,
});

sample({
  clock: meFx.doneData,
  target: $me,
});

sample({
  clock: meFx.doneData,
  fn: (): SessionStatus => "ready",
  target: $sessionStatus,
});

sample({
  clock: meFx.failData,
  fn: getFailedSessionStatus,
  target: $sessionStatus,
});

sample({
  clock: meFx.failData,
  fn: (error) => error.message,
  target: $sessionError,
});

sample({
  clock: meFx.failData,
  target: $me.reinit,
});
// #endregion

// #region brand
sample({
  clock: brandSelected,
  target: $selectedBrandId,
});

persist({
  store: $selectedBrandId,
  key: "inboxsieve:brand",
});
// #endregion

// #region sign out
sample({
  clock: signOutClicked,
  target: signOutFx,
});

sample({
  clock: signOutFx.finally,
  target: [$me.reinit, $selectedBrandId.reinit],
});

sample({
  clock: signOutFx.finally,
  fn: (): SessionStatus => "signed_out",
  target: $sessionStatus,
});
// #endregion

function getFailedSessionStatus(error: Error): SessionStatus {
  if (!(error instanceof ApiRequestError)) {
    return "error";
  }
  if (error.status === 401) {
    return "signed_out";
  }
  if (error.code === "no_account") {
    return "no_account";
  }
  return "error";
}
