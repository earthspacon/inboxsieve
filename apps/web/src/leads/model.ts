import { obj, str } from '@withease/contracts';
import { attach, combine, createEffect, createEvent, createStore, sample } from 'effector';
import { persist } from 'effector-storage/local';

import { $analyzerSettings } from '../settings/model';
import { toastShown, type Toast } from '../shared/toast-model';
import { demoAnalyzer } from './analyzer';
import type { Analysis, Category, Lead, LeadInput, Stage } from './config';
import { LeadContract } from './contract';
import { createLiveAnalyzer } from './live-analyzer';
import { applyAnalysis, approveDraft, moveLead } from './lib';
import { buildMockLeads } from './mock-leads';

export type Filters = {
  stage: Stage | 'all';
  category: Category | 'all';
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  stage: 'all',
  category: 'all',
  search: '',
};

export const appStarted = createEvent();
export const filtersChanged = createEvent<Partial<Filters>>();
export const draftChanged = createEvent<{ id: string; draft: string }>();
export const draftApproved = createEvent<string>();
export const stageChanged = createEvent<{ id: string; stage: Stage }>();
export const reanalyzeClicked = createEvent<string>();
export const simulateOpened = createEvent();
export const simulateClosed = createEvent();
export const leadSimulated = createEvent<LeadInput>();

export const $leads = createStore<Record<string, Lead>>({});
export const $filters = createStore(DEFAULT_FILTERS);
export const $analyzingIds = createStore<string[]>([]);
export const $isSimulateOpen = createStore(false);

export const $leadList = $leads.map((leads) => {
  return Object.values(leads).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
});

export const $visibleLeads = combine($leadList, $filters, (leads, { stage, category, search }) => {
  const query = search.trim().toLowerCase();
  return leads.filter((lead) => {
    const matchesStage = stage === 'all' || lead.stage === stage;
    const matchesCategory = category === 'all' || lead.analysis?.category === category;
    const matchesSearch = !query || `${lead.name} ${lead.company} ${lead.subject}`.toLowerCase().includes(query);
    return matchesStage && matchesCategory && matchesSearch;
  });
});

const seedFx = createEffect(() => {
  return buildMockLeads({ now: Date.now() });
});

const createLeadFx = createEffect((input: LeadInput): Lead => {
  const receivedAt = new Date().toISOString();
  return {
    ...input,
    id: `lead-${Date.now()}`,
    source: 'form',
    receivedAt,
    stage: 'new',
    history: [{ stage: 'new', at: receivedAt }],
    analysis: null,
    draft: '',
  };
});

const analyzeFx = attach({
  source: $analyzerSettings,
  effect: async ({ mode, apiKey }, { id, input }: { id: string; input: LeadInput }) => {
    if (mode === 'live' && !apiKey) {
      throw new Error('Live mode needs an Anthropic API key (Settings)');
    }
    const analyzer = mode === 'live' ? createLiveAnalyzer({ apiKey }) : demoAnalyzer;
    const analysis: Analysis = await analyzer.analyze(input);
    return {
      id,
      analysis,
      at: new Date().toISOString(),
    };
  },
});

const moveLeadFx = createEffect(({ id, stage }: { id: string; stage: Stage }) => {
  return {
    id,
    stage,
    at: new Date().toISOString(),
  };
});

const approveFx = createEffect((id: string) => {
  return {
    id,
    at: new Date().toISOString(),
  };
});

// #region start
sample({
  clock: appStarted,
  source: $leads,
  filter: (leads) => Object.keys(leads).length === 0,
  target: seedFx,
});

sample({
  clock: seedFx.doneData,
  fn: (leads) => Object.fromEntries(leads.map((lead) => [lead.id, lead])),
  target: $leads,
});
// #endregion

// #region filters
sample({
  clock: filtersChanged,
  source: $filters,
  fn: (filters, change) => {
    return {
      ...filters,
      ...change,
    };
  },
  target: $filters,
});
// #endregion

// #region simulate + analyze
sample({
  clock: simulateOpened,
  fn: () => true,
  target: $isSimulateOpen,
});

sample({
  clock: [simulateClosed, leadSimulated],
  fn: () => false,
  target: $isSimulateOpen,
});

sample({
  clock: leadSimulated,
  target: createLeadFx,
});

sample({
  clock: createLeadFx.doneData,
  source: $leads,
  fn: (leads, lead) => {
    return {
      ...leads,
      [lead.id]: lead,
    };
  },
  target: $leads,
});

sample({
  clock: createLeadFx.doneData,
  fn: ({ id, name, email, company, subject, message }) => {
    return {
      id,
      input: {
        name,
        email,
        company,
        subject,
        message,
      },
    };
  },
  target: analyzeFx,
});

sample({
  clock: reanalyzeClicked,
  source: $leads,
  filter: (leads, id) => id in leads,
  fn: (leads, id) => {
    const { name, email, company, subject, message } = leads[id];
    return {
      id,
      input: {
        name,
        email,
        company,
        subject,
        message,
      },
    };
  },
  target: analyzeFx,
});

sample({
  clock: analyzeFx,
  source: $analyzingIds,
  fn: (ids, { id }) => [...ids, id],
  target: $analyzingIds,
});

sample({
  clock: analyzeFx.finally,
  source: $analyzingIds,
  fn: (ids, { params }) => ids.filter((id) => id !== params.id),
  target: $analyzingIds,
});

sample({
  clock: analyzeFx.doneData,
  source: $leads,
  filter: (leads, { id }) => id in leads,
  fn: (leads, { id, analysis, at }) => {
    return {
      ...leads,
      [id]: applyAnalysis({
        lead: leads[id],
        analysis,
        at,
      }),
    };
  },
  target: $leads,
});

sample({
  clock: analyzeFx.failData,
  fn: (error): Omit<Toast, 'id'> => {
    return {
      text: error.message,
      tone: 'error',
    };
  },
  target: toastShown,
});
// #endregion

// #region draft + pipeline
sample({
  clock: draftChanged,
  source: $leads,
  filter: (leads, { id }) => id in leads,
  fn: (leads, { id, draft }) => {
    return {
      ...leads,
      [id]: {
        ...leads[id],
        draft,
      },
    };
  },
  target: $leads,
});

sample({
  clock: draftApproved,
  target: approveFx,
});

sample({
  clock: approveFx.doneData,
  source: $leads,
  filter: (leads, { id }) => id in leads,
  fn: (leads, { id, at }) => {
    return {
      ...leads,
      [id]: approveDraft({ lead: leads[id], at }),
    };
  },
  target: $leads,
});

sample({
  clock: approveFx.doneData,
  source: $leads,
  filter: (leads, { id }) => id in leads,
  fn: (leads, { id }): Omit<Toast, 'id'> => {
    return {
      text: `Reply sent to ${leads[id].email}`,
      tone: 'success',
    };
  },
  target: toastShown,
});

sample({
  clock: stageChanged,
  target: moveLeadFx,
});

sample({
  clock: moveLeadFx.doneData,
  source: $leads,
  filter: (leads, { id }) => id in leads,
  fn: (leads, { id, stage, at }) => {
    return {
      ...leads,
      [id]: moveLead({
        lead: leads[id],
        stage,
        at,
      }),
    };
  },
  target: $leads,
});
// #endregion

// #region persist
persist({
  store: $leads,
  key: 'ai-lead-agent:leads',
  contract: obj(str, LeadContract),
});
// #endregion
