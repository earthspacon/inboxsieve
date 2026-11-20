import { useStoreMap, useUnit } from "effector-react";
import { ArrowLeft, Check, RefreshCw, Send, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { INTENT_LABELS, STAGE_CONFIG } from "../leads/config";
import type { Analysis, Lead, Stage } from "../leads/config";
import { $analyzingIds, $leads, draftApproved, draftChanged, reanalyzeClicked, stageChanged } from "../leads/model";
import { Avatar, Card, formatDate, ScoreBadge, StagePill } from "./ui";

const APPROVABLE_STAGES: Stage[] = ["new", "qualified"];

export const LeadPage = () => {
  const { id = "" } = useParams();
  const lead = useStoreMap({
    store: $leads,
    keys: [id],
    fn: (leads, [leadId]) => leads[leadId] ?? null,
  });

  if (!lead) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        Lead not found.{" "}
        <Link to="/" className="text-brand-600 underline">
          Back to inbox
        </Link>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Inbox
      </Link>
      <LeadHeader lead={lead} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <OriginalMessage lead={lead} />
          <DraftEditor lead={lead} />
        </div>
        <div className="space-y-4">
          <AnalysisCard lead={lead} />
          <StageCard lead={lead} />
        </div>
      </div>
    </div>
  );
};

const LeadHeader = ({ lead }: { lead: Lead }) => {
  const { analyzingIds } = useUnit({ analyzingIds: $analyzingIds });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name={lead.name} />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight lg:truncate">{lead.subject}</h1>
        <p className="truncate text-sm text-slate-500">
          {lead.name}
          {lead.company ? ` · ${lead.company}` : ""} · {lead.email}
        </p>
      </div>
      <ScoreBadge analysis={lead.analysis} isAnalyzing={analyzingIds.includes(lead.id)} />
      <StagePill stage={lead.stage} />
    </div>
  );
};

const OriginalMessage = ({ lead }: { lead: Lead }) => {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium tracking-wide uppercase">
          Original {lead.source === "email" ? "email" : "form submission"}
        </span>
        <span>{formatDate(lead.receivedAt)}</span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line text-slate-800">{lead.message}</p>
    </Card>
  );
};

const DraftEditor = ({ lead }: { lead: Lead }) => {
  const isSpam = lead.analysis?.category === "spam";
  const canApprove = APPROVABLE_STAGES.includes(lead.stage) && lead.draft.trim().length > 0;

  if (isSpam) {
    return (
      <Card className="p-5 text-sm text-slate-500">
        The agent marked this as spam and archived it. No reply drafted.
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-brand-600" />
        <h2 className="text-sm font-semibold">Draft reply</h2>
        <span className="text-xs text-slate-400">edit before sending</span>
      </div>
      <textarea
        aria-label="Draft reply"
        rows={11}
        value={lead.draft}
        onChange={(event) => draftChanged({ id: lead.id, draft: event.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => reanalyzeClicked(lead.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="size-4" />
          Re-analyze
        </button>
        <button
          type="button"
          disabled={!canApprove}
          onClick={() => draftApproved(lead.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Send className="size-4" />
          Approve &amp; send
        </button>
      </div>
    </Card>
  );
};

const AnalysisCard = ({ lead }: { lead: Lead }) => {
  if (!lead.analysis) {
    return <Card className="p-5 text-sm text-slate-500">The agent is reading this lead…</Card>;
  }
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold">Agent assessment</h2>
      <ScoreMeter score={lead.analysis.score} />
      <p className="mt-4 text-sm text-slate-700">{lead.analysis.summary}</p>
      <ExtractedFields analysis={lead.analysis} />
      <h3 className="mt-4 mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Why this score</h3>
      <ul className="space-y-1.5">
        {lead.analysis.reasons.map((reason) => {
          return (
            <li key={reason} className="flex gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
              {reason}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const ScoreMeter = ({ score }: { score: number }) => {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Fit score</span>
        <span className="text-2xl font-semibold tabular-nums">
          {score}
          <span className="text-sm text-slate-400">/100</span>
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-emerald-500"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const ExtractedFields = ({ analysis }: { analysis: Analysis }) => {
  const rows = [
    {
      label: "Intent",
      value: INTENT_LABELS[analysis.intent],
    },
    {
      label: "Budget",
      value: analysis.budget ?? "—",
    },
    {
      label: "Timeline",
      value: analysis.timeline ?? "—",
    },
    {
      label: "Decision maker",
      value: analysis.decisionMaker ? "Yes" : "Unknown",
    },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3">
      {rows.map(({ label, value }) => {
        return (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
};

const StageCard = ({ lead }: { lead: Lead }) => {
  const nextStages = STAGE_CONFIG[lead.stage].next;
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Pipeline</h2>
      <ol className="mb-4 space-y-1">
        {lead.history.map((change) => {
          return (
            <li
              key={`${change.stage}-${change.at}`}
              className="flex items-center justify-between text-xs text-slate-500"
            >
              <StagePill stage={change.stage} />
              {formatDate(change.at)}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {nextStages.map((stage) => {
          return (
            <button
              key={stage}
              type="button"
              onClick={() => stageChanged({ id: lead.id, stage })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Move to {STAGE_CONFIG[stage].label}
            </button>
          );
        })}
      </div>
    </Card>
  );
};
