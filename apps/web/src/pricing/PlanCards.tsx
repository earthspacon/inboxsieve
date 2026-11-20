import type { BillingInterval, Plan } from "@inboxsieve/contract";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";
import { PLAN_CARDS, type PlanCard } from "./config";

export const IntervalToggle = ({
  interval,
  onChange,
}: {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) => {
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm"
    >
      {(["monthly", "yearly"] as const).map((option) => {
        return (
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => onChange(option)}
            className={`rounded-md px-3 py-1 font-medium ${interval === option ? "bg-brand-600 text-white" : "text-slate-600"}`}
          >
            {option === "monthly" ? "Monthly" : "Yearly (2 months free)"}
          </button>
        );
      })}
    </div>
  );
};

export const PlanCards = ({
  interval,
  renderAction,
}: {
  interval: BillingInterval;
  renderAction: (plan: Plan) => ReactNode;
}) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PLAN_CARDS.map((card) => {
        return <PlanCardView key={card.plan} card={card} interval={interval} action={renderAction(card.plan)} />;
      })}
    </div>
  );
};

const PlanCardView = ({ card, interval, action }: { card: PlanCard; interval: BillingInterval; action: ReactNode }) => {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-lg font-semibold">{card.name}</h3>
        <p className="text-2xl font-semibold tracking-tight">
          {interval === "monthly" ? card.monthly : card.yearly}
          {interval === "yearly" && (
            <span className="ml-2 text-sm font-normal text-emerald-700">{card.yearlyNote}</span>
          )}
        </p>
        <p className="text-sm text-slate-500">{card.limits.join(" · ")}</p>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">{card.name} price breakdown per month</caption>
        <tbody className="divide-y divide-slate-100">
          {card.lines.map((line) => {
            return (
              <tr key={line.label}>
                <td className="py-1.5 pr-2 text-slate-600">{line.label}</td>
                <td className="py-1.5 text-right tabular-nums">{line.amount}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-1.5 pr-2">{card.total.label}</td>
            <td className="py-1.5 text-right tabular-nums">{card.total.amount}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-auto">{action}</div>
    </Card>
  );
};
