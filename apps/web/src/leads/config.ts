export type Stage = 'new' | 'qualified' | 'replied' | 'won' | 'lost';
export type Category = 'hot' | 'warm' | 'cold' | 'spam';
export type Intent = 'new-project' | 'partnership' | 'rfp' | 'support' | 'job' | 'spam' | 'other';
export type Source = 'form' | 'email';

export type LeadInput = {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
};

export type Analysis = {
  score: number;
  category: Category;
  intent: Intent;
  budget: string | null;
  timeline: string | null;
  decisionMaker: boolean;
  summary: string;
  reasons: string[];
  draftReply: string;
};

export type StageChange = {
  stage: Stage;
  at: string;
};

export type Lead = LeadInput & {
  id: string;
  source: Source;
  receivedAt: string;
  stage: Stage;
  history: StageChange[];
  analysis: Analysis | null;
  draft: string;
};

export const STAGES: Stage[] = ['new', 'qualified', 'replied', 'won', 'lost'];

export const STAGE_CONFIG: Record<Stage, { label: string; next: Stage[]; tone: string }> = {
  new: {
    label: 'New',
    next: ['qualified', 'replied', 'lost'],
    tone: 'bg-slate-100 text-slate-700',
  },
  qualified: {
    label: 'Qualified',
    next: ['replied', 'lost'],
    tone: 'bg-indigo-50 text-indigo-700',
  },
  replied: {
    label: 'Replied',
    next: ['won', 'lost'],
    tone: 'bg-sky-50 text-sky-700',
  },
  won: {
    label: 'Won',
    next: [],
    tone: 'bg-emerald-50 text-emerald-700',
  },
  lost: {
    label: 'Lost',
    next: ['new'],
    tone: 'bg-rose-50 text-rose-700',
  },
};

export const CATEGORY_CONFIG: Record<Category, { label: string; tone: string }> = {
  hot: {
    label: 'Hot',
    tone: 'bg-emerald-500 text-white',
  },
  warm: {
    label: 'Warm',
    tone: 'bg-amber-400 text-amber-950',
  },
  cold: {
    label: 'Cold',
    tone: 'bg-slate-300 text-slate-800',
  },
  spam: {
    label: 'Spam',
    tone: 'bg-rose-500 text-white',
  },
};

export const INTENT_LABELS: Record<Intent, string> = {
  'new-project': 'New project',
  partnership: 'Partnership',
  rfp: 'Enterprise RFP',
  support: 'Support request',
  job: 'Job / vendor pitch',
  spam: 'Spam',
  other: 'General enquiry',
};

export const HOT_SCORE = 75;
export const WARM_SCORE = 50;
export const MINUTES_SAVED_PER_LEAD = 14;
export const STUDIO_NAME = 'Spaceson Labs';
