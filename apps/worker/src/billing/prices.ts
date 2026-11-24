import type { BillingPeriod, PaidPlan } from "@inboxsieve/contract";

import type { Env } from "../env";

export function findPriceIds(env: Env): Record<BillingPeriod, string | null> {
  return {
    monthly: env.PADDLE_PRICE_MONTHLY || null,
    yearly: env.PADDLE_PRICE_YEARLY || null,
  };
}

// Both the monthly and the yearly price buy the one paid plan.
export function findPlanByPrice({ env, priceId }: { env: Env; priceId: string | null }): PaidPlan | null {
  if (!priceId) {
    return null;
  }
  return Object.values(findPriceIds(env)).includes(priceId) ? "solo" : null;
}
