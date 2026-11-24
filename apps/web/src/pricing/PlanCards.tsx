import type { BillingPeriod, Plan } from "@inboxsieve/contract";
import { useUnit } from "effector-react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";
import { PLAN_CARDS, type PlanCard, type PlanPrice } from "./config";
import { $period, periodSelected } from "./model";

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
};
const BILLING_PERIODS: BillingPeriod[] = ["monthly", "yearly"];

export const PlanCards = ({ renderAction }: { renderAction: (plan: Plan) => ReactNode }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PLAN_CARDS.map((card) => {
        return <PlanCardView key={card.plan} card={card} action={renderAction(card.plan)} />;
      })}
    </div>
  );
};

const PlanCardView = ({ card, action }: { card: PlanCard; action: ReactNode }) => {
  const prices = usePeriodPrices(card);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{card.name}</h3>
          {card.hasPeriodSwitch && <PeriodSwitch />}
        </div>
        {prices.map(({ period, price, isHidden }) => {
          return (
            <p
              key={period}
              hidden={isHidden}
              className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight"
            >
              {price.price}
              <span className="text-sm font-normal text-slate-500">· {price.priceNote}</span>
            </p>
          );
        })}
      </div>
      <ul className="space-y-2 text-sm text-slate-700">
        {card.bullets.map((bullet) => {
          return (
            <li key={bullet} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              {bullet}
            </li>
          );
        })}
      </ul>
      {prices.map(({ period, price, isHidden }) => {
        return <PriceBreakdown key={period} name={card.name} price={price} isHidden={isHidden} />;
      })}
      <div className="mt-auto">{action}</div>
    </Card>
  );
};

const PeriodSwitch = () => {
  const { period } = useUnit({
    period: $period,
  });

  return (
    <div
      className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-sm"
      role="group"
      aria-label="Billing period"
    >
      {BILLING_PERIODS.map((option) => {
        const isActive = option === period;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => periodSelected(option)}
            className={`min-h-9 rounded-md px-3 font-medium ${isActive ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {PERIOD_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
};

const PriceBreakdown = ({ name, price, isHidden }: { name: string; price: PlanPrice; isHidden: boolean }) => {
  return (
    <details className="text-sm" hidden={isHidden}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-slate-500 hover:text-slate-700">
        Where the money goes
      </summary>
      <table className="w-full">
        <caption className="sr-only">{name} price breakdown</caption>
        <tbody className="divide-y divide-slate-100">
          {price.lines.map((line) => {
            return (
              <tr key={line.label}>
                <td className="py-1.5 pr-2 text-slate-600">{line.label}</td>
                <td className="py-1.5 text-right tabular-nums">{line.amount}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-1.5 pr-2">{price.total.label}</td>
            <td className="py-1.5 text-right tabular-nums">{price.total.amount}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
};

// Both periods stay in the server-rendered HTML; the switch only hides the other one, so nothing jumps.
function usePeriodPrices(card: PlanCard) {
  const { period } = useUnit({
    period: $period,
  });

  if (!card.hasPeriodSwitch) {
    return [{ period: "monthly", price: card.prices.monthly, isHidden: false }];
  }
  return BILLING_PERIODS.map((option) => {
    return {
      period: option,
      price: card.prices[option],
      isHidden: option !== period,
    };
  });
}
