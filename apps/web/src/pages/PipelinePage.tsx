import { useUnit } from 'effector-react';
import { ChevronRight } from 'lucide-react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';

import { STAGE_CONFIG, STAGES } from '../leads/config';
import type { Lead, Stage } from '../leads/config';
import { $analyzingIds, $leadList, stageChanged } from '../leads/model';
import { ScoreBadge } from './ui';

const DRAG_TYPE = 'text/lead-id';

export const PipelinePage = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-slate-500">Drag a card to the next stage, or use the arrow buttons.</p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1000px] grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            return <StageColumn key={stage} stage={stage} />;
          })}
        </div>
      </div>
    </div>
  );
};

const StageColumn = ({ stage }: { stage: Stage }) => {
  const { leads, analyzingIds } = useUnit({ leads: $leadList, analyzingIds: $analyzingIds });
  const stageLeads = leads.filter((lead) => lead.stage === stage);

  const drop = (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const lead = leads.find((item) => item.id === id);
    if (lead && STAGE_CONFIG[lead.stage].next.includes(stage)) {
      stageChanged({ id, stage });
    }
  };

  return (
    <section
      data-stage={stage}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      className="flex min-h-[420px] flex-col rounded-xl bg-slate-100/80 p-2"
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="text-sm font-semibold">{STAGE_CONFIG[stage].label}</h2>
        <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">{stageLeads.length}</span>
      </header>
      <div className="flex flex-col gap-2">
        {stageLeads.map((lead) => {
          return <PipelineCard key={lead.id} lead={lead} isAnalyzing={analyzingIds.includes(lead.id)} />;
        })}
      </div>
    </section>
  );
};

const PipelineCard = ({ lead, isAnalyzing }: { lead: Lead; isAnalyzing: boolean }) => {
  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData(DRAG_TYPE, lead.id)}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <Link to={`/leads/${lead.id}`} className="block">
        <p className="truncate text-sm font-semibold hover:text-brand-700">{lead.company || lead.name}</p>
        <p className="truncate text-xs text-slate-500">{lead.subject}</p>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-1">
        <ScoreBadge analysis={lead.analysis} isAnalyzing={isAnalyzing} />
        {lead.analysis?.budget && <span className="truncate text-xs text-slate-500">{lead.analysis.budget}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGE_CONFIG[lead.stage].next.map((stage) => {
          return (
            <button
              key={stage}
              type="button"
              onClick={() => stageChanged({ id: lead.id, stage })}
              className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            >
              <ChevronRight className="size-3" />
              {STAGE_CONFIG[stage].label}
            </button>
          );
        })}
      </div>
    </article>
  );
};
