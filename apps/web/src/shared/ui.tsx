import type { Category, LeadStage } from "@inboxsieve/contract";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { CATEGORY_CONFIG, STAGE_CONFIG } from "../leads/config";

// Keeps small links and chips at the 32 px minimum tap size on phones.
export const TAP_TARGET = "inline-flex min-h-8 min-w-8 items-center justify-center";
// Phones get the 44 px minimum on buttons, inputs and the public site's links.
export const PHONE_TAP = "max-sm:min-h-11";

export const BUTTON_PRIMARY =
  "max-sm:min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50";
export const BUTTON_SECONDARY =
  "max-sm:min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const BUTTON_DANGER =
  "max-sm:min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50";
export const INPUT =
  "max-sm:min-h-11 mt-1 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-surface shadow-sm ${className}`}>
      {children}
    </section>
  );
};

export const PageHeader = ({ title, subtitle }: { title: string; subtitle?: ReactNode }) => {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
};

export const LoadingState = ({ label = "Loading…" }: { label?: string }) => {
  return (
    <Card className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </Card>
  );
};

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => {
  return (
    <Card className="space-y-3 p-8 text-center text-sm">
      <p className="flex items-center justify-center gap-2 font-medium text-rose-800">
        <AlertTriangle className="size-4" />
        {message}
      </p>
      <button type="button" onClick={onRetry} className={BUTTON_SECONDARY}>
        Try again
      </button>
    </Card>
  );
};

export const Banner = ({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) => {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${BANNER_TONES[tone]}`}>{children}</div>;
};

export const ScoreBadge = ({ score, category }: { score: number | null; category: Category | null }) => {
  if (score === null || category === null) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not scored</span>;
  }
  const { label, tone } = CATEGORY_CONFIG[category];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {score}
      <span className="font-medium opacity-90">{label}</span>
    </span>
  );
};

export const StagePill = ({ stage }: { stage: LeadStage }) => {
  const { label, tone } = STAGE_CONFIG[stage];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
};

export const Avatar = ({ name }: { name: string }) => {
  const initials = (name || "?")
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

export function formatDay(iso: string) {
  return DAY_FORMAT.format(new Date(iso));
}

const BANNER_TONES = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-brand-100 bg-brand-50 text-brand-ink",
};
