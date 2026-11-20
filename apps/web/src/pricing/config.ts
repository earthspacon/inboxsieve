import type { Plan } from "@inboxsieve/contract";

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

// Spec §3.2, copied line by line: every dollar shown.
export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "solo",
    name: "Solo",
    monthly: "$29/mo",
    yearly: "$290/yr",
    yearlyNote: "2 months free",
    limits: ["1 brand", "2 sources", "500 leads/mo", "1 seat"],
    lines: [
      {
        label: "Payment processing (Paddle 5% + 50¢)",
        amount: "$1.95",
      },
      {
        label: "Claude Haiku AI, 500 leads at ~$0.0004 (shown at cost)",
        amount: "≈ $0.20",
      },
      {
        label: "Hosting + email delivery (Cloudflare + Resend, pro-rata)",
        amount: "≈ $0.30",
      },
      {
        label: "Our fee",
        amount: "$26.55",
      },
    ],
    total: {
      label: "You pay (sales tax/VAT added by Paddle at checkout where due)",
      amount: "$29.00",
    },
  },
  {
    plan: "agency",
    name: "Agency",
    monthly: "$79/mo",
    yearly: "$790/yr",
    yearlyNote: "2 months free",
    limits: ["10 brands (one per client)", "20 sources", "3,000 leads/mo", "3 seats"],
    lines: [
      {
        label: "Payment processing (5% + 50¢)",
        amount: "$4.45",
      },
      {
        label: "Claude Haiku AI, 3,000 leads",
        amount: "≈ $1.20",
      },
      {
        label: "Hosting + email",
        amount: "≈ $1.00",
      },
      {
        label: "Our fee",
        amount: "$72.35",
      },
    ],
    total: {
      label: "You pay",
      amount: "$79.00",
    },
  },
];

export const PLAN_NAMES: Record<Plan, string> = {
  solo: "Solo",
  agency: "Agency",
};
