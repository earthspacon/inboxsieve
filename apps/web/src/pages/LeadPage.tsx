import { STAGE_TRANSITIONS, type LeadDetailDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { INTENT_LABELS, STAGE_CONFIG, STATUS_LABELS } from "../leads/config";
import { buildComposeLinks } from "../leads/lib";
import {
  $draft,
  draftCopied,
  draftEdited,
  draftSaveClicked,
  LeadGate,
  leadRemote,
  notSpamClicked,
  repliedClicked,
  retryClicked,
  stageChosen,
  wrongScoreSubmitted,
} from "../leads/model";
import { $brandId } from "../session/model";
import {
  Avatar,
  Banner,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Card,
  ErrorState,
  formatDate,
  INPUT,
  LoadingState,
  ScoreBadge,
  StagePill,
  TAP_TARGET,
} from "../shared/ui";

const PENDING_STATUSES = new Set(["received", "parsed", "queued", "analyzing"]);

export const LeadPage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  const { leadId = "" } = useParams();
  useGate(LeadGate, { brandId, leadId });

  return (
    <div className="space-y-4">
      <Link to="/app" className={`${TAP_TARGET} gap-1 text-sm text-slate-500 hover:text-slate-900`}>
        <ArrowLeft className="size-4" />
        Inbox
      </Link>
      <LeadView brandId={brandId} leadId={leadId} />
    </div>
  );
};

const LeadView = ({ brandId, leadId }: { brandId: string; leadId: string }) => {
  const { lead, status, error } = useUnit({
    lead: leadRemote.$data,
    status: leadRemote.$status,
    error: leadRemote.$error,
  });

  if (status === "loading") {
    return <LoadingState label="Loading lead…" />;
  }
  if (status === "error" || !lead) {
    return <ErrorState message={error || "Lead not found"} onRetry={() => leadRemote.fx({ brandId, leadId })} />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <LeadHeader lead={lead} />
        <StatusNotice lead={lead} brandId={brandId} />
        <MessageCard lead={lead} brandId={brandId} />
        <DraftCard lead={lead} />
      </div>
      <div className="min-w-0 space-y-4">
        <AnalysisCard lead={lead} />
        <StageCard lead={lead} />
        <FeedbackCard lead={lead} />
        <HistoryCard lead={lead} />
      </div>
    </div>
  );
};

const LeadHeader = ({ lead }: { lead: LeadDetailDto }) => {
  return (
    <Card className="flex items-start gap-3 p-4">
      <Avatar name={lead.name || lead.email} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{lead.subject || "(no subject)"}</h1>
        <p className="truncate text-sm text-slate-600">
          {lead.name} {lead.email && <span className="text-slate-400">&lt;{lead.email}&gt;</span>}
          {lead.company && <span> · {lead.company}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ScoreBadge score={lead.score} category={lead.category} />
          <StagePill stage={lead.stage} />
          <span className="text-xs text-slate-400">{formatDate(lead.receivedAt)}</span>
          {lead.repliedAt && <span className="text-xs text-emerald-700">Replied {formatDate(lead.repliedAt)}</span>}
        </div>
      </div>
    </Card>
  );
};

const StatusNotice = ({ lead, brandId }: { lead: LeadDetailDto; brandId: string }) => {
  if (PENDING_STATUSES.has(lead.status)) {
    return (
      <Banner tone="info">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {STATUS_LABELS[lead.status]}… Reload in a few seconds.
        </span>
      </Banner>
    );
  }
  if (lead.status === "analysis_failed") {
    return (
      <Banner tone="danger">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>The analysis failed 3 times{lead.lastError ? `: ${lead.lastError}` : "."}</span>
          <button type="button" onClick={() => retryClicked()} className={BUTTON_SECONDARY}>
            <RotateCcw className="size-4" />
            Retry
          </button>
        </div>
      </Banner>
    );
  }
  if (lead.status === "over_quota") {
    return (
      <Banner tone="warning">
        This lead arrived after you hit this month's limit. It's stored but not scored.{" "}
        <Link to="/app/billing" className="font-semibold underline">
          Upgrade
        </Link>
      </Banner>
    );
  }
  if (lead.status === "parse_failed") {
    return (
      <Banner tone="warning">
        We couldn't read this message.{" "}
        <a
          href={buildOriginalUrl({ lead, brandId })}
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline"
        >
          View original
        </a>
      </Banner>
    );
  }
  return null;
};

const MessageCard = ({ lead, brandId }: { lead: LeadDetailDto; brandId: string }) => {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Message</h2>
        {lead.hasOriginal && (
          <a
            href={buildOriginalUrl({ lead, brandId })}
            target="_blank"
            rel="noreferrer"
            className={`${TAP_TARGET} gap-1 text-xs text-slate-500 hover:text-slate-900`}
          >
            View original
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap text-slate-800">{lead.message || "(empty)"}</p>
    </Card>
  );
};

const DraftCard = ({ lead }: { lead: LeadDetailDto }) => {
  const { draft } = useUnit({ draft: $draft });
  const links = buildComposeLinks({
    to: lead.email,
    subject: lead.subject,
    body: draft,
  });
  const canReply = lead.stage !== "spam" && lead.stage !== "lost";

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Reply draft</h2>
        <p className="text-xs text-slate-500">Edit it, then send it from your own mail. We never send as you.</p>
      </div>
      <textarea
        aria-label="Reply draft"
        rows={10}
        value={draft}
        onChange={(event) => draftEdited(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => draftSaveClicked()}
          disabled={draft === lead.draft}
          className={BUTTON_SECONDARY}
        >
          Save draft
        </button>
        <button type="button" onClick={() => draftCopied()} className={BUTTON_SECONDARY}>
          <Copy className="size-4" />
          Copy
        </button>
        <a href={links.gmail} target="_blank" rel="noreferrer" className={BUTTON_SECONDARY}>
          Open in Gmail
        </a>
        <a href={links.outlook} target="_blank" rel="noreferrer" className={BUTTON_SECONDARY}>
          Open in Outlook
        </a>
        <a href={links.mailto} className={BUTTON_SECONDARY}>
          Mail app
        </a>
        {canReply && !lead.repliedAt && (
          <button type="button" onClick={() => repliedClicked()} className={BUTTON_PRIMARY}>
            <Check className="size-4" />
            Mark replied
          </button>
        )}
      </div>
    </Card>
  );
};

const AnalysisCard = ({ lead }: { lead: LeadDetailDto }) => {
  if (!lead.analysis) {
    return null;
  }
  const { analysis } = lead;
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Why this score</h2>
      <p className="text-sm text-slate-700">{analysis.summary}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {analysis.reasons.map((reason) => {
          return <li key={reason}>{reason}</li>;
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="Intent" value={INTENT_LABELS[analysis.intent]} />
        <Fact label="Budget" value={analysis.budget ?? "—"} />
        <Fact label="Timeline" value={analysis.timeline ?? "—"} />
        <Fact label="Decision maker" value={analysis.decisionMaker ? "Yes" : "No"} />
      </dl>
    </Card>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
};

const StageCard = ({ lead }: { lead: LeadDetailDto }) => {
  const nextStages = STAGE_TRANSITIONS[lead.stage];
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Stage</h2>
      {lead.stage === "spam" && (
        <button type="button" onClick={() => notSpamClicked()} className={`${BUTTON_PRIMARY} w-full`}>
          Not spam
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {nextStages
          .filter((stage) => {
            return lead.stage !== "spam" || stage !== "new";
          })
          .map((stage) => {
            return (
              <button key={stage} type="button" onClick={() => stageChosen(stage)} className={BUTTON_SECONDARY}>
                Move to {STAGE_CONFIG[stage].label}
              </button>
            );
          })}
      </div>
      {nextStages.length === 0 && <p className="text-sm text-slate-500">Won is final.</p>}
    </Card>
  );
};

const FeedbackCard = ({ lead }: { lead: LeadDetailDto }) => {
  const [expectedScore, setExpectedScore] = useState("");
  const [note, setNote] = useState("");

  if (lead.score === null) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    wrongScoreSubmitted({
      expectedScore: Number(expectedScore),
      note,
    });
    setExpectedScore("");
    setNote("");
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-2">
        <h2 className="text-sm font-semibold">Wrong score?</h2>
        <label className="block text-xs text-slate-600">
          What should it be (0–100)?
          <input
            required
            type="number"
            min={0}
            max={100}
            value={expectedScore}
            onChange={(event) => setExpectedScore(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="block text-xs text-slate-600">
          Why (optional)
          <input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} className={INPUT} />
        </label>
        <button type="submit" className={`${BUTTON_SECONDARY} w-full`}>
          Send feedback
        </button>
      </form>
    </Card>
  );
};

const HistoryCard = ({ lead }: { lead: LeadDetailDto }) => {
  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-sm font-semibold">History</h2>
      <ol className="space-y-1 text-xs text-slate-600">
        {lead.events.map((event) => {
          return (
            <li key={`${event.type}-${event.at}-${event.to}`} className="flex justify-between gap-2">
              <span>
                {event.type}: {event.from ?? "—"} → {event.to ?? "—"}
              </span>
              <span className="shrink-0 text-slate-400">{formatDate(event.at)}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

function buildOriginalUrl({ lead, brandId }: { lead: LeadDetailDto; brandId: string }) {
  return `/api/brands/${brandId}/leads/${lead.id}/original`;
}
