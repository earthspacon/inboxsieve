import { useUnit } from "effector-react";
import { Mail, MessageSquareText, Search } from "lucide-react";
import { Link } from "react-router-dom";

import { CATEGORY_CONFIG, STAGE_CONFIG, STAGES } from "../leads/config";
import type { Category, Lead, Stage } from "../leads/config";
import { $analyzingIds, $filters, $leadList, $visibleLeads, filtersChanged } from "../leads/model";
import { Avatar, Card, formatDate, ScoreBadge, StagePill } from "./ui";

const CATEGORIES: Category[] = ["hot", "warm", "cold", "spam"];

export const InboxPage = () => {
  return (
    <div className="space-y-4">
      <InboxHeader />
      <Filters />
      <LeadList />
    </div>
  );
};

const InboxHeader = () => {
  const { leads } = useUnit({ leads: $leadList });
  const newCount = leads.filter((lead) => lead.stage === "new" || lead.stage === "qualified").length;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="text-sm text-slate-500">
        {leads.length} leads · {newCount} waiting for a reply · scored and drafted by the agent
      </p>
    </div>
  );
};

const Filters = () => {
  const { filters } = useUnit({ filters: $filters });
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative block lg:w-64">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
        <input
          type="search"
          placeholder="Search name, company, subject"
          value={filters.search}
          onChange={(event) => filtersChanged({ search: event.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-brand-500 focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Chip isActive={filters.stage === "all"} label="All stages" onClick={() => filtersChanged({ stage: "all" })} />
        {STAGES.map((stage: Stage) => {
          return (
            <Chip
              key={stage}
              isActive={filters.stage === stage}
              label={STAGE_CONFIG[stage].label}
              onClick={() => filtersChanged({ stage })}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 lg:ml-auto">
        <Chip
          isActive={filters.category === "all"}
          label="Any score"
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

const Chip = ({ isActive, label, onClick }: { isActive: boolean; label: string; onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${isActive ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
    >
      {label}
    </button>
  );
};

const LeadList = () => {
  const { leads, analyzingIds } = useUnit({ leads: $visibleLeads, analyzingIds: $analyzingIds });

  if (leads.length === 0) {
    return <Card className="p-10 text-center text-sm text-slate-500">No leads match these filters.</Card>;
  }
  return (
    <Card className="divide-y divide-slate-100 overflow-hidden">
      {leads.map((lead) => {
        return <LeadRow key={lead.id} lead={lead} isAnalyzing={analyzingIds.includes(lead.id)} />;
      })}
    </Card>
  );
};

const LeadRow = ({ lead, isAnalyzing }: { lead: Lead; isAnalyzing: boolean }) => {
  const SourceIcon = lead.source === "email" ? Mail : MessageSquareText;
  return (
    <Link to={`/leads/${lead.id}`} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
      <Avatar name={lead.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{lead.name}</p>
          <p className="hidden truncate text-sm text-slate-500 sm:block">{lead.company}</p>
          <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDate(lead.receivedAt)}</span>
        </div>
        <p className="truncate text-sm text-slate-800">{lead.subject}</p>
        <p className="truncate text-xs text-slate-500">{lead.analysis?.summary ?? lead.message}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <ScoreBadge analysis={lead.analysis} isAnalyzing={isAnalyzing} />
          <StagePill stage={lead.stage} />
          <SourceIcon className="size-3.5 text-slate-400" />
        </div>
      </div>
    </Link>
  );
};
