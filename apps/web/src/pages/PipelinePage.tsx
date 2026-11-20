import { STAGE_TRANSITIONS, type LeadStage, type LeadSummaryDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { PIPELINE_STAGES, STAGE_CONFIG } from "../leads/config";
import { pipelineMoveChosen, PipelineGate, pipelineRemote } from "../leads/model";
import { $brandId } from "../session/model";
import { Card, ErrorState, LoadingState, PageHeader, ScoreBadge } from "../shared/ui";

export const PipelinePage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  useGate(PipelineGate, { brandId });

  return (
    <div className="space-y-4">
      <PageHeader title="Pipeline" subtitle="Move leads along as the conversation goes. Spam stays out of here." />
      <Board brandId={brandId} />
    </div>
  );
};

const Board = ({ brandId }: { brandId: string }) => {
  const { leads, status, error } = useUnit({
    leads: pipelineRemote.$data,
    status: pipelineRemote.$status,
    error: pipelineRemote.$error,
  });

  if (status === "loading") {
    return <LoadingState label="Loading pipeline…" />;
  }
  if (status === "error") {
    return <ErrorState message={error} onRetry={() => pipelineRemote.fx({ brandId })} />;
  }
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {PIPELINE_STAGES.map((stage) => {
        return (
          <Column
            key={stage}
            stage={stage}
            leads={leads.filter((lead) => {
              return lead.stage === stage;
            })}
          />
        );
      })}
    </div>
  );
};

const Column = ({ stage, leads }: { stage: LeadStage; leads: LeadSummaryDto[] }) => {
  return (
    <section aria-label={STAGE_CONFIG[stage].label} className="space-y-2 rounded-xl bg-slate-100/70 p-2">
      <h2 className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
        {STAGE_CONFIG[stage].label}
        <span className="tabular-nums">{leads.length}</span>
      </h2>
      {leads.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">Nothing here</p>}
      {leads.map((lead) => {
        return <PipelineCard key={lead.id} lead={lead} />;
      })}
    </section>
  );
};

const PipelineCard = ({ lead }: { lead: LeadSummaryDto }) => {
  const nextStages = STAGE_TRANSITIONS[lead.stage].filter((stage) => {
    return stage !== "spam";
  });
  return (
    <Card className="space-y-2 p-3">
      <Link to={`/app/leads/${lead.id}`} className="block">
        <p className="truncate text-sm font-semibold">{lead.name || lead.email}</p>
        <p className="truncate text-xs text-slate-500">{lead.subject}</p>
      </Link>
      <ScoreBadge score={lead.score} category={lead.category} />
      <div className="flex flex-wrap gap-1">
        {nextStages.map((stage) => {
          return (
            <button
              key={stage}
              type="button"
              onClick={() => pipelineMoveChosen({ leadId: lead.id, stage })}
              className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              → {STAGE_CONFIG[stage].label}
            </button>
          );
        })}
      </div>
    </Card>
  );
};
