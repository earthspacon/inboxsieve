import { useUnit } from "effector-react";
import { Clock, Gauge, Inbox, ShieldX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MINUTES_SAVED_PER_LEAD, STAGE_CONFIG } from "../leads/config";
import { getDashboardStats } from "../leads/lib";
import { $leadList } from "../leads/model";
import { Card } from "./ui";

export const DashboardPage = () => {
  const { leads } = useUnit({ leads: $leadList });
  const stats = getDashboardStats({ leads, now: Date.now() });
  const maxWeekly = Math.max(1, ...stats.weekly.map((week) => week.count));
  const firstStage = stats.funnel[0]?.count || 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">What the agent did for the team so far.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Inbox} label="Leads this week" value={String(stats.thisWeek)} hint={`${stats.total} total`} />
        <Kpi icon={Gauge} label="Avg fit score" value={String(stats.averageScore)} hint="spam excluded" />
        <Kpi
          icon={Clock}
          label="Time saved"
          value={`${stats.hoursSaved} h`}
          hint={`${MINUTES_SAVED_PER_LEAD} min per lead triaged`}
        />
        <Kpi icon={ShieldX} label="Spam filtered" value={String(stats.spam)} hint="archived, no reply" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Leads per week</h2>
          <div className="flex h-44 items-end gap-3">
            {stats.weekly.map((week) => {
              return (
                <div key={week.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium tabular-nums">{week.count}</span>
                  <div
                    className="w-full rounded-t-md bg-brand-500"
                    style={{ height: `${(week.count / maxWeekly) * 120}px` }}
                  />
                  <span className="text-[11px] text-slate-500">{week.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Conversion by stage</h2>
          <div className="space-y-3">
            {stats.funnel.map(({ stage, count }) => {
              const percent = Math.round((count / firstStage) * 100);
              return (
                <div key={stage}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{STAGE_CONFIG[stage].label}</span>
                    <span className="tabular-nums text-slate-500">
                      {count} · {percent}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-sky-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

type KpiProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
};

const Kpi = ({ icon: Icon, label, value, hint }: KpiProps) => {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon className="size-4 text-brand-600" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-400">{hint}</p>
    </Card>
  );
};
