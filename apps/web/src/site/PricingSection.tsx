import { useUnit } from "effector-react";
import { Link } from "react-router-dom";

import type { Plan } from "@inboxsieve/contract";

import { $interval, intervalChosen } from "../billing/model";
import { FREE_TAGLINE, TRIAL_CTA } from "../pricing/config";
import { IntervalToggle, PlanCards } from "../pricing/PlanCards";
import { BUTTON_PRIMARY } from "../shared/ui";
import { NEVER_DO, START_CTA } from "./config";

// Every sign-up starts on Free; the Solo trial starts from Billing once signed in.
const PUBLIC_PLAN_CTA: Record<Plan, string> = {
  free: START_CTA,
  solo: TRIAL_CTA,
  agency: START_CTA,
};

export const PricingSection = () => {
  const { interval } = useUnit({
    interval: $interval,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Every dollar shown</h2>
          <p className="text-sm text-slate-500">
            {FREE_TAGLINE} {TRIAL_CTA}, also without a card. Cancel any time. 14-day refund, no questions asked.
          </p>
        </div>
        <IntervalToggle interval={interval} onChange={intervalChosen} />
      </div>
      <PlanCards
        interval={interval}
        renderAction={(plan) => {
          return (
            <Link to="/sign-in" className={`${BUTTON_PRIMARY} w-full`}>
              {PUBLIC_PLAN_CTA[plan]}
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
