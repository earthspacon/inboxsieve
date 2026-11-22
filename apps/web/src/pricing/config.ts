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
  monthly: string;
  yearly: string;
  yearlyNote: string;
  limits: string[];
  lines: PriceLine[];
  total: PriceLine;
};

export const FREE_TAGLINE = "Free forever. No card needed.";
export const TRIAL_CTA = `Try Solo free for ${TRIAL_DAYS} days`;

const FREE = buildPriceBreakdown("free");
const SOLO = buildPriceBreakdown("solo");
const AGENCY = buildPriceBreakdown("agency");

// Spec §3.2, line by line: every dollar shown. The amounts come from the contract's price math.
export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "free",
    name: "Free",
    monthly: "$0",
    yearly: "$0",
    yearlyNote: "forever",
    limits: [
      "1 brand",
      "1 source",
      `${PLAN_LIMITS.free.leadsPerMonth} leads/mo`,
      "1 seat",
      "email alerts (no Slack)",
      "CSV export",
    ],
    lines: [
      {
        label: "Payment processing",
        amount: formatUsd(FREE.paymentCents),
      },
      {
        label: `Groq AI, ${PLAN_LIMITS.free.leadsPerMonth} leads at ~$0.0004 (we pay it)`,
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
      label: "You pay. No card needed",
      amount: formatUsd(FREE.priceCents),
    },
  },
  {
    plan: "solo",
    name: "Solo",
    monthly: `${formatPrice(PLAN_PRICES.solo.monthlyCents)}/mo`,
    yearly: `${formatPrice(PLAN_PRICES.solo.yearlyCents)}/yr`,
    yearlyNote: "2 months free",
    limits: ["1 brand", "2 sources", "500 leads/mo", "1 seat"],
    lines: [
      {
        label: "Payment processing (Paddle 5% + 50¢)",
        amount: formatUsd(SOLO.paymentCents),
      },
      {
        label: "Groq AI, 500 leads at ~$0.0004 (shown at cost)",
        amount: `≈ ${formatUsd(SOLO.aiCents)}`,
      },
      {
        label: "Hosting + email delivery (Cloudflare + Brevo, pro-rata)",
        amount: `≈ ${formatUsd(SOLO.hostingCents)}`,
      },
      {
        label: "Our fee",
        amount: formatUsd(SOLO.ourFeeCents),
      },
    ],
    total: {
      label: "You pay (sales tax/VAT added by Paddle at checkout where due)",
      amount: formatUsd(SOLO.priceCents),
    },
  },
  {
    plan: "agency",
    name: "Agency",
    monthly: `${formatPrice(PLAN_PRICES.agency.monthlyCents)}/mo`,
    yearly: `${formatPrice(PLAN_PRICES.agency.yearlyCents)}/yr`,
    yearlyNote: "2 months free",
    limits: ["10 brands (one per client)", "20 sources", "3,000 leads/mo", "3 seats"],
    lines: [
      {
        label: "Payment processing (5% + 50¢)",
        amount: formatUsd(AGENCY.paymentCents),
      },
      {
        label: "Groq AI, 3,000 leads",
        amount: `≈ ${formatUsd(AGENCY.aiCents)}`,
      },
      {
        label: "Hosting + email",
        amount: `≈ ${formatUsd(AGENCY.hostingCents)}`,
      },
      {
        label: "Our fee",
        amount: formatUsd(AGENCY.ourFeeCents),
      },
    ],
    total: {
      label: "You pay",
      amount: formatUsd(AGENCY.priceCents),
    },
  },
];

export const PLAN_NAMES: Record<Plan, string> = {
  free: "Free",
  solo: "Solo",
  agency: "Agency",
};
