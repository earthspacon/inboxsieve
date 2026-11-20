import type { Category, Intent, LeadStage, LeadStatus, SourceState } from "@inboxsieve/contract";

export const STAGES: LeadStage[] = ["new", "contacted", "meeting", "won", "lost", "spam"];
export const PIPELINE_STAGES: LeadStage[] = ["new", "contacted", "meeting", "won", "lost"];
export const CATEGORIES: Category[] = ["hot", "warm", "cold", "spam"];

export const STAGE_CONFIG: Record<LeadStage, { label: string; tone: string }> = {
  new: {
    label: "New",
    tone: "bg-slate-100 text-slate-700",
  },
  contacted: {
    label: "Contacted",
    tone: "bg-sky-50 text-sky-700",
  },
  meeting: {
    label: "Meeting",
    tone: "bg-indigo-50 text-indigo-700",
  },
  won: {
    label: "Won",
    tone: "bg-emerald-50 text-emerald-700",
  },
  lost: {
    label: "Lost",
    tone: "bg-rose-50 text-rose-700",
  },
  spam: {
    label: "Spam",
    tone: "bg-amber-50 text-amber-800",
  },
};

export const CATEGORY_CONFIG: Record<Category, { label: string; tone: string }> = {
  hot: {
    label: "Hot",
    tone: "bg-emerald-500 text-white",
  },
  warm: {
    label: "Warm",
    tone: "bg-amber-400 text-amber-950",
  },
  cold: {
    label: "Cold",
    tone: "bg-slate-300 text-slate-800",
  },
  spam: {
    label: "Spam",
    tone: "bg-rose-500 text-white",
  },
};

export const INTENT_LABELS: Record<Intent, string> = {
  "new-project": "New project",
  partnership: "Partnership",
  rfp: "Enterprise RFP",
  support: "Support request",
  job: "Job / vendor pitch",
  spam: "Spam",
  other: "General enquiry",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  received: "Received",
  parsed: "Parsed",
  spam_filtered: "Spam (rule)",
  queued: "Queued for analysis",
  analyzing: "Analyzing",
  analyzed: "Analyzed",
  analysis_failed: "Analysis failed",
  over_quota: "Over the monthly limit",
  parse_failed: "Couldn't read the message",
};

export const SOURCE_STATE_CONFIG: Record<SourceState, { label: string; tone: string }> = {
  not_connected: {
    label: "Not connected",
    tone: "bg-slate-100 text-slate-600",
  },
  awaiting_first_message: {
    label: "Waiting for the first message",
    tone: "bg-amber-50 text-amber-800",
  },
  verification_pending: {
    label: "Confirm forwarding",
    tone: "bg-indigo-50 text-indigo-700",
  },
  connected: {
    label: "Connected",
    tone: "bg-emerald-50 text-emerald-700",
  },
  error: {
    label: "Error",
    tone: "bg-rose-50 text-rose-700",
  },
  disabled: {
    label: "Disabled",
    tone: "bg-slate-200 text-slate-600",
  },
};

export const SCORE_FILTERS = [
  {
    label: "Any score",
    scoreMin: 0,
  },
  {
    label: "50+",
    scoreMin: 50,
  },
  {
    label: "75+",
    scoreMin: 75,
  },
  {
    label: "90+",
    scoreMin: 90,
  },
];
