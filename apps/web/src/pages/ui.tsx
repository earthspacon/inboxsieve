import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { CATEGORY_CONFIG, STAGE_CONFIG } from "../leads/config";
import type { Analysis, Stage } from "../leads/config";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
};

export const ScoreBadge = ({ analysis, isAnalyzing }: { analysis: Analysis | null; isAnalyzing: boolean }) => {
  if (isAnalyzing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        <Loader2 className="size-3 animate-spin" />
        Analyzing
      </span>
    );
  }
  if (!analysis) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not scored</span>;
  }
  const { label, tone } = CATEGORY_CONFIG[analysis.category];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {analysis.score}
      <span className="font-medium opacity-90">{label}</span>
    </span>
  );
};

export const StagePill = ({ stage }: { stage: Stage }) => {
  const { label, tone } = STAGE_CONFIG[stage];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
};

export const Avatar = ({ name }: { name: string }) => {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-sm font-semibold text-white">
      {initials}
    </span>
  );
};

export function formatDate(iso: string) {
  return DATE_FORMAT.format(new Date(iso));
}
