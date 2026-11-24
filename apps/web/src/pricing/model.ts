import type { BillingPeriod } from "@inboxsieve/contract";
import { createEvent, createStore, sample } from "effector";

export const periodSelected = createEvent<BillingPeriod>();

export const $period = createStore<BillingPeriod>("monthly");

sample({
  clock: periodSelected,
  target: $period,
});
