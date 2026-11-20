import { useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { $interval, intervalChosen } from "../billing/model";
import { IntervalToggle, PlanCards } from "../pricing/PlanCards";
import { BUTTON_PRIMARY } from "../shared/ui";
import { NEVER_DO } from "./config";

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
            7-day trial, card required. Cancel any time. 14-day refund, no questions asked.
          </p>
        </div>
        <IntervalToggle interval={interval} onChange={intervalChosen} />
      </div>
      <PlanCards
        interval={interval}
        renderAction={() => {
          return (
            <Link to="/sign-in" className={`${BUTTON_PRIMARY} w-full`}>
              Start 7-day trial
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
