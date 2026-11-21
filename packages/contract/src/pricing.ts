import { PLAN_LIMITS, type Plan } from "./domain";

// Owner 2026-11-21: $29/$79 was too much for an unknown product. A year costs ten months.
export const PLAN_PRICES: Record<Plan, { monthlyCents: number; yearlyCents: number }> = {
  free: {
    monthlyCents: 0,
    yearlyCents: 0,
  },
  solo: {
    monthlyCents: 900,
    yearlyCents: 9000,
  },
  agency: {
    monthlyCents: 2900,
    yearlyCents: 29000,
  },
};

// Paddle's fee per transaction (paddle.com/pricing): 5% + 50¢.
export const PADDLE_FEE = {
  percent: 5,
  fixedCents: 50,
};

// Groq (openai/gpt-oss-120b) per analyzed lead (spec §3.6) and hosting + email delivery per month, pro-rata (spec §3.2).
export const AI_COST_PER_LEAD_USD = 0.0004;
const HOSTING_CENTS: Record<Plan, number> = {
  free: 3,
  solo: 30,
  agency: 100,
};

export type PriceBreakdown = {
  priceCents: number;
  paymentCents: number;
  aiCents: number;
  hostingCents: number;
  ourFeeCents: number;
};

// The itemized monthly price on the pricing page. On a paid plan the lines add up to the price;
// on Free nothing is charged and we pay the AI and hosting ourselves.
export function buildPriceBreakdown(
  plan: Plan,
  { priceCents = PLAN_PRICES[plan].monthlyCents }: { priceCents?: number } = {},
): PriceBreakdown {
  const aiCents = Math.round(PLAN_LIMITS[plan].leadsPerMonth * AI_COST_PER_LEAD_USD * 100);
  const hostingCents = HOSTING_CENTS[plan];

  if (priceCents === 0) {
    return { priceCents, paymentCents: 0, aiCents, hostingCents, ourFeeCents: 0 };
  }
  const paymentCents = Math.round((priceCents * PADDLE_FEE.percent) / 100) + PADDLE_FEE.fixedCents;
  return {
    priceCents,
    paymentCents,
    aiCents,
    hostingCents,
    ourFeeCents: priceCents - paymentCents - aiCents - hostingCents,
  };
}

export function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// "$9" for whole dollars, "$9.50" otherwise.
export function formatPrice(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : formatUsd(cents);
}
