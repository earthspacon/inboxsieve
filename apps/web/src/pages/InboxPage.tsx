import type { LeadSummaryDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { Inbox, Loader2, Megaphone, PlugZap, Search, Send } from "lucide-react";
import { Link } from "react-router-dom";

import { CATEGORIES, CATEGORY_CONFIG, SCORE_FILTERS, STAGE_CONFIG, STAGES, STATUS_LABELS } from "../leads/config";
import { getStageChipCount, type InboxEmptyState } from "../leads/lib";
import {
  $filters,
  $inboxEmptyState,
  $isTestLeadSending,
  filtersChanged,
  filtersReset,
  InboxGate,
  inboxRemote,
  stageCountsRemote,
  testLeadClicked,
} from "../leads/model";
import { $brandId } from "../session/model";
import {
  Avatar,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Card,
  ErrorState,
  formatDate,
  LoadingState,
  PageHeader,
  ScoreBadge,
  StagePill,
} from "../shared/ui";

const PENDING_STATUSES = new Set(["received", "parsed", "queued", "analyzing"]);

export const InboxPage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  useGate(InboxGate, { brandId });

  return (
    <div className="space-y-4">
      <PageHeader title="Inbox" subtitle="Every inquiry scored against your profile, spam set aside." />
      <Filters />
      <LeadList />
    </div>
  );
};

const Filters = () => {
  const { filters, counts } = useUnit({ filters: $filters, counts: stageCountsRemote.$data });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block lg:w-72">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            type="search"
            aria-label="Search leads"
            placeholder="Search name, email, company, subject"
            value={filters.search}
            onChange={(event) => filtersChanged({ search: event.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-surface py-2 pr-3 pl-9 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 lg:ml-auto">
          Score
          <select
            aria-label="Minimum score"
            value={filters.scoreMin}
            onChange={(event) => filtersChanged({ scoreMin: Number(event.target.value) })}
            className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-sm"
          >
            {SCORE_FILTERS.map((option) => {
              return (
                <option key={option.scoreMin} value={option.scoreMin}>
                  {option.label}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip isActive={filters.stage === "all"} label="All stages" onClick={() => filtersChanged({ stage: "all" })} />
        {STAGES.map((stage) => {
          return (
            <Chip
              key={stage}
              isActive={filters.stage === stage}
              label={STAGE_CONFIG[stage].label}
              count={getStageChipCount({ stage, counts })}
              onClick={() => filtersChanged({ stage })}
            />
          );
        })}
        <span className="mx-1 hidden w-px bg-slate-200 sm:block" />
        <Chip
          isActive={filters.category === "all"}
          label="Any category"
          onClick={() => filtersChanged({ category: "all" })}
        />
        {CATEGORIES.map((category) => {
          return (
            <Chip
              key={category}
              isActive={filters.category === category}
              label={CATEGORY_CONFIG[category].label}
              onClick={() => filtersChanged({ category })}
            />
          );
        })}
      </div>
    </div>
  );
};

const Chip = ({
  isActive,
  label,
  count = null,
  onClick,
}: {
  isActive: boolean;
  label: string;
  count?: number | null;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${isActive ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}
    >
      {label}
      {typeof count === "number" && (
        <span aria-hidden="true" className="ml-1.5 tabular-nums opacity-70">
          {count}
        </span>
      )}
    </button>
  );
};

const LeadList = () => {
  const { leads, status, error, emptyState, brandId, filters } = useUnit({
    leads: inboxRemote.$data,
    status: inboxRemote.$status,
    error: inboxRemote.$error,
    emptyState: $inboxEmptyState,
    brandId: $brandId,
    filters: $filters,
  });

  if (status === "loading") {
    return <LoadingState label="Loading leads…" />;
  }
  if (status === "error") {
    return <ErrorState message={error} onRetry={() => inboxRemote.fx({ brandId, filters })} />;
  }
  if (emptyState) {
    return <EmptyInbox state={emptyState} />;
  }
  return (
    <Card className="divide-y divide-slate-100 overflow-hidden">
      {leads.map((lead) => {
        return <LeadRow key={lead.id} lead={lead} />;
      })}
    </Card>
  );
};

const EmptyInbox = ({ state }: { state: NonNullable<InboxEmptyState> }) => {
  const { isSending } = useUnit({ isSending: $isTestLeadSending });

  if (state === "no_sources") {
    return (
      <Card className="space-y-3 p-10 text-center">
        <PlugZap className="mx-auto size-8 text-brand-ink" />
        <h2 className="text-lg font-semibold">Connect your first source</h2>
        <p className="text-sm text-slate-500">
          Forward your contact-form email or paste a webhook URL into your form tool.
        </p>
        <Link to="/app/onboarding" className={BUTTON_PRIMARY}>
          Connect a source
        </Link>
      </Card>
    );
  }
  if (state === "no_leads") {
    return (
      <Card className="space-y-3 p-10 text-center">
        <Inbox className="mx-auto size-8 text-brand-ink" />
        <h2 className="text-lg font-semibold">No leads yet</h2>
        <p className="text-sm text-slate-500">
          Your source is set up. Send a test lead to see how scoring and drafts look.
        </p>
        <button type="button" disabled={isSending} onClick={() => testLeadClicked()} className={BUTTON_PRIMARY}>
          <Send className="size-4" />
          Send a test lead
        </button>
      </Card>
    );
  }
  if (state === "no_pitches") {
    return (
      <Card className="space-y-3 p-10 text-center">
        <Megaphone className="mx-auto size-8 text-brand-ink" />
        <p className="text-sm text-slate-500">Vendor offers, SEO and dev-shop pitches land here, out of your way.</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-3 p-10 text-center text-sm text-slate-500">
      <p>No leads match these filters.</p>
      <button type="button" onClick={() => filtersReset()} className={BUTTON_SECONDARY}>
        Clear filters
      </button>
    </Card>
  );
};

const LeadRow = ({ lead }: { lead: LeadSummaryDto }) => {
  return (
    <Link to={`/app/leads/${lead.id}`} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
      <Avatar name={lead.name || lead.email} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{lead.name || lead.email || "Unknown sender"}</p>
          <p className="hidden truncate text-sm text-slate-500 sm:block">{lead.company}</p>
          <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDate(lead.receivedAt)}</span>
        </div>
        <p className="truncate text-sm text-slate-800">{lead.subject || "(no subject)"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <LeadScore lead={lead} />
          <StagePill stage={lead.stage} />
        </div>
      </div>
    </Link>
  );
};

const LeadScore = ({ lead }: { lead: LeadSummaryDto }) => {
  if (PENDING_STATUSES.has(lead.status)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-ink">
        <Loader2 className="size-3 animate-spin" />
        Analyzing
      </span>
    );
  }
  if (lead.score === null) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{STATUS_LABELS[lead.status]}</span>
    );
  }
  return <ScoreBadge score={lead.score} category={lead.category} />;
};
