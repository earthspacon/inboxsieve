import type { PaidPlan } from "@inboxsieve/contract";

import type { Env } from "../env";

export function findPriceId(env: Env): string | null {
  return env.PADDLE_PRICE_MONTHLY || null;
}

export function findPlanByPrice({ env, priceId }: { env: Env; priceId: string | null }): PaidPlan | null {
  if (!priceId) {
    return null;
  }
  return priceId === findPriceId(env) ? "solo" : null;
}
