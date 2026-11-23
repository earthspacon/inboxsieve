import {
  buildPriceBreakdown,
  formatPrice,
  formatUsd,
  PLAN_LIMITS,
  PLAN_PRICES,
  TRIAL_DAYS,
  type Plan,
} from "@inboxsieve/contract";

type PriceLine = { label: string; amount: string };

export type PlanCard = {
  plan: Plan;
  name: string;
  price: string;
  priceNote: string;
  bullets: string[];
  lines: PriceLine[];
  total: PriceLine;
};

export const PAID_PRICE = formatPrice(PLAN_PRICES.solo.monthlyCents);
export const PAID_PRICE_LABEL = `${PAID_PRICE} / month · cancel anytime`;
export const FREE_TAGLINE = "Free forever. No card needed.";
export const TRIAL_CTA = `Try it free for ${TRIAL_DAYS} days`;

const FREE = buildPriceBreakdown("free");
const PAID = buildPriceBreakdown("solo");

// Every dollar is still shown, under the card; the amounts come from the contract's price math.
export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "free",
    name: "Free",
    price: "$0",
    priceNote: "forever, no card",
    bullets: [
      `${PLAN_LIMITS.free.leadsPerMonth} leads a month, scored and sorted`,
      "1 inbox or form connected",
      "Email alerts for hot leads",
      "CSV export any time",
    ],
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
  },
  {
    plan: "solo",
    name: "InboxSieve",
    price: `${PAID_PRICE} / month`,
    priceNote: "cancel anytime",
    bullets: [
      `${PLAN_LIMITS.solo.leadsPerMonth} leads a month, each with a drafted reply`,
      `${PLAN_LIMITS.solo.sources} inboxes or forms connected`,
      "Hot-lead alerts by email and Slack",
      "14-day refund, no questions asked",
    ],
    lines: [
      {
        label: "Payment processing (Paddle 5% + 50¢)",
        amount: formatUsd(PAID.paymentCents),
      },
      {
        label: `AI scoring, ${PLAN_LIMITS.solo.leadsPerMonth} leads at ~$0.0004 (shown at cost)`,
        amount: `≈ ${formatUsd(PAID.aiCents)}`,
      },
      {
        label: "Hosting + email delivery (pro-rata)",
        amount: `≈ ${formatUsd(PAID.hostingCents)}`,
      },
      {
        label: "Our fee",
        amount: formatUsd(PAID.ourFeeCents),
      },
    ],
    total: {
      label: "You pay (Paddle adds sales tax/VAT where due)",
      amount: formatUsd(PAID.priceCents),
    },
  },
];

export const PLAN_NAMES: Record<Plan, string> = {
  free: "Free",
  solo: `${PAID_PRICE} / month`,
};
