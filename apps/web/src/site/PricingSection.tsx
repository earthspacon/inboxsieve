import { Link } from "react-router-dom";

import type { Plan } from "@inboxsieve/contract";

import { FREE_TAGLINE, PAID_PRICE_LABEL, TRIAL_CTA } from "../pricing/config";
import { PlanCards } from "../pricing/PlanCards";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "../shared/ui";
import { NEVER_DO, START_CTA } from "./config";

// Every sign-up starts on Free; the paid trial starts from Billing once signed in.
const PUBLIC_PLAN_CTA: Record<Plan, { label: string; className: string }> = {
  free: {
    label: START_CTA,
    className: BUTTON_SECONDARY,
  },
  solo: {
    label: TRIAL_CTA,
    className: BUTTON_PRIMARY,
  },
};

export const PricingSection = () => {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One plan, {PAID_PRICE_LABEL}</h2>
        <p className="text-sm text-slate-600">
          {FREE_TAGLINE} {TRIAL_CTA}, also without a card. 14-day refund, no questions asked.
        </p>
      </div>
      <PlanCards
        renderAction={(plan) => {
          const cta = PUBLIC_PLAN_CTA[plan];
          return (
            <Link to="/sign-in" className={`${cta.className} min-h-11 w-full`}>
              {cta.label}
            </Link>
          );
        }}
      />
      <p className="text-sm text-slate-600">
        Over the limit, leads are still stored but not analyzed, and the app shows an upgrade banner. Nothing is lost.
      </p>
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">What we never do:</span> {NEVER_DO.join(" · ")}.
      </p>
    </section>
  );
};
