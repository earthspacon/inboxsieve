import type { BillingDto, BillingInterval, BrandDto, Plan } from "@inboxsieve/contract";
import { attach, createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { $me, meFx, meRefreshRequested } from "../session/model";
import { apiRequest, ApiRequestError } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";
import { findPriceId, loadPaddle, openPaddleCheckout } from "./paddle";

const ACTIVATION_POLL_MS = 2000;

export const BillingGate = createGate();
export const BrandsGate = createGate();

export const intervalChosen = createEvent<BillingInterval>();
export const checkoutClicked = createEvent<Plan>();
export const manageBillingClicked = createEvent();
export const brandCreateSubmitted = createEvent<string>();
export const upgradePromptClosed = createEvent();
const paddleEventReceived = createEvent<string>();

export const billingRemote = createRemote<void, BillingDto | null>({
  handler: () => {
    return apiRequest<BillingDto>({ path: "/api/billing" });
  },
  initial: null,
});

export const $interval = createStore<BillingInterval>("monthly");
export const $isWaitingForActivation = createStore(false);
export const $checkoutError = createStore("");
export const $upgradePrompt = createStore("");

const openCheckoutFx = attach({
  source: {
    billing: billingRemote.$data,
    me: $me,
    interval: $interval,
  },
  effect: async ({ billing, me, interval }, plan: Plan) => {
    if (!billing || !me) {
      throw new Error("Billing isn't loaded yet");
    }
    const priceId = findPriceId({ checkout: billing.checkout, plan, interval });
    if (!priceId) {
      throw new Error("This plan isn't on sale yet");
    }
    const paddle = await loadPaddle({
      checkout: billing.checkout,
      onEvent: (name) => paddleEventReceived(name),
    });
    openPaddleCheckout({
      paddle,
      priceId,
      email: me.user.email,
      accountId: me.account.id,
    });
  },
});

const waitFx = createEffect(() => {
  return new Promise((resolve) => {
    setTimeout(resolve, ACTIVATION_POLL_MS);
  });
});

export const portalFx = createEffect(async () => {
  const { url } = await apiRequest<{ url: string }>({ path: "/api/billing/portal", method: "POST" });
  window.location.assign(url);
});

export const createBrandFx = createEffect((name: string) => {
  return apiRequest<BrandDto>({
    path: "/api/brands",
    method: "POST",
    body: { name },
  });
});

// #region load
sample({
  clock: [BillingGate.open, BrandsGate.open],
  target: billingRemote.fx,
});
// #endregion

// #region checkout
sample({
  clock: intervalChosen,
  target: $interval,
});

sample({
  clock: checkoutClicked,
  target: [openCheckoutFx, $checkoutError.reinit],
});

sample({
  clock: openCheckoutFx.failData,
  fn: (error) => error.message,
  target: $checkoutError,
});

sample({
  clock: paddleEventReceived,
  filter: (name) => name === "checkout.completed",
  fn: () => true,
  target: [$isWaitingForActivation, waitFx],
});

// The webhook unlocks the account a moment after checkout; poll /api/me until it does.
sample({
  clock: waitFx.done,
  target: meRefreshRequested,
});

sample({
  clock: meFx.doneData,
  source: $isWaitingForActivation,
  filter: (isWaiting, me) => isWaiting && me.account.access === "locked",
  target: waitFx,
});

sample({
  clock: meFx.doneData,
  filter: (me) => me.account.access !== "locked",
  target: $isWaitingForActivation.reinit,
});
// #endregion

// #region portal
sample({
  clock: manageBillingClicked,
  target: portalFx,
});

sample({
  clock: portalFx.failData,
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
// #endregion

// #region brands
sample({
  clock: brandCreateSubmitted,
  target: [createBrandFx, $upgradePrompt.reinit],
});

sample({
  clock: createBrandFx.done,
  target: meRefreshRequested,
});

sample({
  clock: createBrandFx.failData,
  filter: (error) => error instanceof ApiRequestError && error.code === "plan_limit",
  fn: (error) => error.message,
  target: $upgradePrompt,
});

sample({
  clock: createBrandFx.failData,
  filter: (error) => !(error instanceof ApiRequestError && error.code === "plan_limit"),
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: upgradePromptClosed,
  target: $upgradePrompt.reinit,
});
// #endregion
