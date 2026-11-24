import {
  buildPriceBreakdown,
  formatPrice,
  formatUsd,
  PLAN_LIMITS,
  PLAN_PRICES,
  TRIAL_DAYS,
  type BillingPeriod,
  type Plan,
} from "@inboxsieve/contract";

type PriceLine = { label: string; amount: string };

export type PlanPrice = {
  price: string;
  priceNote: string;
  lines: PriceLine[];
  total: PriceLine;
};

export type PlanCard = {
  plan: Plan;
  name: string;
  bullets: string[];
  hasPeriodSwitch: boolean;
  prices: Record<BillingPeriod, PlanPrice>;
};

export const PAID_PRICE = formatPrice(PLAN_PRICES.solo.monthlyCents);
export const PAID_YEARLY_PRICE = formatPrice(PLAN_PRICES.solo.yearlyCents);
export const PERIOD_PRICE_LABELS: Record<BillingPeriod, string> = {
  monthly: `${PAID_PRICE} / month`,
  yearly: `${PAID_YEARLY_PRICE} / year`,
};
export const PAID_PRICE_LABEL = `${PAID_PRICE} / month or ${PAID_YEARLY_PRICE} / year`;
export const FREE_TAGLINE = "Free forever. No card needed.";
export const TRIAL_CTA = `Try it free for ${TRIAL_DAYS} days`;
export const YEARLY_NOTE = "2 months free";

const FREE = buildPriceBreakdown("free");
const FREE_PRICE: PlanPrice = {
  price: "$0",
  priceNote: "forever, no card",
  lines: [
    {
      label: "Payment processing",
      amount: formatUsd(FREE.paymentCents),
    },
    {
      label: `AI scoring, ${PLAN_LIMITS.free.leadsPerMonth} leads at ~$0.0004 (we pay it)`,
      amount: `≈ ${formatUsd(FREE.aiCents)}`,
    },
    {
      label: "Hosting + email delivery (we pay it)",
      amount: `≈ ${formatUsd(FREE.hostingCents)}`,
    },
    {
      label: "Our fee",
      amount: formatUsd(FREE.ourFeeCents),
    },
  ],
  total: {
    label: "You pay",
    amount: formatUsd(FREE.priceCents),
  },
};
const PAID_LINE_LABELS: Record<BillingPeriod, { ai: string; hosting: string }> = {
  monthly: {
    ai: `AI scoring, ${PLAN_LIMITS.solo.leadsPerMonth} leads at ~$0.0004 (shown at cost)`,
    hosting: "Hosting + email delivery (pro-rata)",
  },
  yearly: {
    ai: `AI scoring, 12 × ${PLAN_LIMITS.solo.leadsPerMonth} leads at ~$0.0004 (shown at cost)`,
    hosting: "Hosting + email delivery for 12 months",
  },
};

// Every dollar is still shown, under the card; the amounts come from the contract's price math.
export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "free",
    name: "Free",
    bullets: [
      `${PLAN_LIMITS.free.leadsPerMonth} leads a month, scored and sorted`,
      "1 inbox or form connected",
      "Email alerts for hot leads",
      "CSV export any time",
    ],
    hasPeriodSwitch: false,
    prices: {
      monthly: FREE_PRICE,
      yearly: FREE_PRICE,
    },
  },
  {
    plan: "solo",
    name: "InboxSieve",
    bullets: [
      `${PLAN_LIMITS.solo.leadsPerMonth} leads a month, each with a drafted reply`,
      `${PLAN_LIMITS.solo.sources} inboxes or forms connected`,
      "Hot-lead alerts by email and Slack",
      "14-day refund, no questions asked",
    ],
    hasPeriodSwitch: true,
    prices: {
      monthly: buildPaidPrice({ period: "monthly", priceNote: "cancel anytime" }),
      yearly: buildPaidPrice({ period: "yearly", priceNote: YEARLY_NOTE }),
    },
  },
];

function buildPaidPrice({ period, priceNote }: { period: BillingPeriod; priceNote: string }): PlanPrice {
  const paid = buildPriceBreakdown("solo", { period });

  return {
    price: PERIOD_PRICE_LABELS[period],
    priceNote,
    lines: [
      {
        label: "Payment processing (Paddle 5% + 50¢)",
        amount: formatUsd(paid.paymentCents),
      },
      {
        label: PAID_LINE_LABELS[period].ai,
        amount: `≈ ${formatUsd(paid.aiCents)}`,
      },
      {
        label: PAID_LINE_LABELS[period].hosting,
        amount: `≈ ${formatUsd(paid.hostingCents)}`,
      },
      {
        label: "Our fee",
        amount: formatUsd(paid.ourFeeCents),
      },
    ],
    total: {
      label: "You pay (Paddle adds sales tax/VAT where due)",
      amount: formatUsd(paid.priceCents),
    },
  };
}
