import type { Plan } from "@inboxsieve/contract";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";
import { PLAN_CARDS, type PlanCard } from "./config";

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
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{card.name}</h3>
        <p className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold tracking-tight">
          {card.price}
          <span className="text-sm font-normal text-slate-500">· {card.priceNote}</span>
        </p>
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
      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-slate-500 hover:text-slate-700">
          Where the money goes
        </summary>
        <table className="w-full">
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
      </details>
      <div className="mt-auto">{action}</div>
    </Card>
  );
};
