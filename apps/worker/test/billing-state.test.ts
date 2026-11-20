import type { SubscriptionStatus } from "@inboxsieve/contract";
import { describe, expect, it } from "vitest";

import { nextSubscriptionStatus, type SubscriptionEvent } from "../src/billing/state";

const STATUSES: SubscriptionStatus[] = [
  "no_subscription",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
];

// The spec's subscription lifecycle (§3.4 F1), written out pair by pair. Staying in the same status is always legal.
const LEGAL = new Set([
  "no_subscription>trialing",
  "no_subscription>active",
  "trialing>active",
  "trialing>past_due",
  "trialing>paused",
  "trialing>canceled",
  "active>past_due",
  "active>paused",
  "active>canceled",
  "past_due>active",
  "past_due>paused",
  "past_due>canceled",
  "paused>active",
  "paused>canceled",
  "canceled>expired",
  "canceled>trialing",
  "canceled>active",
  "expired>trialing",
  "expired>active",
]);

const EVENT_FOR_TARGET: Record<Exclude<SubscriptionStatus, "no_subscription">, SubscriptionEvent> = {
  trialing: { type: "subscription.trialing" },
  active: { type: "subscription.activated" },
  past_due: { type: "subscription.past_due" },
  paused: { type: "subscription.paused" },
  canceled: { type: "subscription.canceled" },
  expired: { type: "period_ended" },
};

const CASES = STATUSES.flatMap((current) => {
  return Object.entries(EVENT_FOR_TARGET).map(([target, event]) => {
    return {
      current,
      target,
      event,
      isLegal: current === target || LEGAL.has(`${current}>${target}`),
    };
  });
});

describe("F1 billing: subscription state machine", () => {
  it.each(CASES)("$current → $target is legal: $isLegal", ({ current, target, event, isLegal }) => {
    const result = nextSubscriptionStatus({ current, event });

    expect(result).toEqual(isLegal ? { ok: true, status: target } : { ok: false, reason: "illegal_transition" });
  });

  it("subscription.created and .updated take the status from the payload", () => {
    expect(
      nextSubscriptionStatus({
        current: "no_subscription",
        event: { type: "subscription.created", status: "trialing" },
      }),
    ).toEqual({
      ok: true,
      status: "trialing",
    });
    expect(
      nextSubscriptionStatus({ current: "trialing", event: { type: "subscription.updated", status: "active" } }),
    ).toEqual({
      ok: true,
      status: "active",
    });
  });

  it("an update that would jump from no_subscription to past_due is rejected", () => {
    expect(
      nextSubscriptionStatus({
        current: "no_subscription",
        event: { type: "subscription.updated", status: "past_due" },
      }),
    ).toEqual({ ok: false, reason: "illegal_transition" });
  });
});
