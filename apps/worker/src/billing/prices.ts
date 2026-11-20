import type { BillingInterval, PaidPlan } from "@inboxsieve/contract";

import type { Env } from "../env";

export function buildPriceTable(env: Env): Record<PaidPlan, Record<BillingInterval, string | null>> {
  return {
    solo: {
      monthly: env.PADDLE_PRICE_SOLO_MONTHLY || null,
      yearly: env.PADDLE_PRICE_SOLO_YEARLY || null,
    },
    agency: {
      monthly: env.PADDLE_PRICE_AGENCY_MONTHLY || null,
      yearly: env.PADDLE_PRICE_AGENCY_YEARLY || null,
    },
  };
}

export function findPlanByPrice({ env, priceId }: { env: Env; priceId: string | null }): PaidPlan | null {
  if (!priceId) {
    return null;
  }
  const table = buildPriceTable(env);
  const plans: PaidPlan[] = ["solo", "agency"];
  return (
    plans.find((plan) => {
      return Object.values(table[plan]).includes(priceId);
    }) ?? null
  );
}
