import type { Analysis, Category } from "./analysis";

// "solo" is the internal key of the one $4 plan; the UI never shows it.
export type Plan = "free" | "solo";

// The plan stored on the account; Free isn't a subscription, it's what runs without one.
export type PaidPlan = Exclude<Plan, "free">;

export type SubscriptionStatus =
  "no_subscription" | "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";

export const PLAN_LIMITS: Record<
  Plan,
  { brands: number; sources: number; leadsPerMonth: number; seats: number; slackAlerts: boolean }
> = {
  free: {
    brands: 1,
    sources: 1,
    leadsPerMonth: 50,
    seats: 1,
    slackAlerts: false,
  },
  solo: {
    brands: 1,
    sources: 2,
    leadsPerMonth: 500,
    seats: 1,
    slackAlerts: true,
  },
};

export const TRIAL_DAYS = 14;

export type AccessLevel = "read_only" | "full";

// isFree: no live Paddle subscription or trial, so the Free plan's limits apply.
export const SUBSCRIPTION_RULES: Record<SubscriptionStatus, { access: AccessLevel; isFree: boolean }> = {
  no_subscription: {
    access: "full",
    isFree: true,
  },
  trialing: {
    access: "full",
    isFree: false,
  },
  active: {
    access: "full",
    isFree: false,
  },
  past_due: {
    access: "full",
    isFree: false,
  },
  paused: {
    access: "read_only",
    isFree: false,
  },
  canceled: {
    access: "full",
    isFree: false,
  },
  expired: {
    access: "full",
    isFree: true,
  },
};

export function getEffectivePlan({
  paidPlan,
  subscription,
}: {
  paidPlan: PaidPlan;
  subscription: SubscriptionStatus;
}): Plan {
  return SUBSCRIPTION_RULES[subscription].isFree ? "free" : paidPlan;
}

export type SourceKind = "email" | "webhook";

export type SourceState =
  "not_connected" | "awaiting_first_message" | "verification_pending" | "connected" | "error" | "disabled";

export type LeadStatus =
  | "received"
  | "parsed"
  | "spam_filtered"
  | "queued"
  | "analyzing"
  | "analyzed"
  | "analysis_failed"
  | "over_quota"
  | "parse_failed";

// Spam and pitch sit outside the pipeline: set aside, never alerted on.
export type LeadStage = "new" | "contacted" | "meeting" | "won" | "lost" | "spam" | "pitch";

export const STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ["contacted", "meeting", "lost", "spam", "pitch"],
  contacted: ["meeting", "won", "lost"],
  meeting: ["won", "lost"],
  won: [],
  lost: ["new"],
  spam: ["new"],
  pitch: ["new"],
};

export const SET_ASIDE_STAGES: LeadStage[] = ["spam", "pitch"];

export type LeadStageCountsDto = Record<LeadStage, number>;

export type FeedbackKind = "not_spam" | "wrong_score";

export type BusinessProfile = {
  services: string;
  idealClient: string;
  minBudget: string;
  tone: string;
  signature: string;
  bookingLink: string;
};

export type ProfileState = "defaults" | "saved";

export type Me = {
  user: { id: string; email: string };
  account: { id: string; plan: Plan; subscription: SubscriptionStatus; access: AccessLevel };
  role: "owner" | "member";
};

export type AlertState = "enabled" | "disabled" | "delivery_failed";

export const DEFAULT_ALERT_THRESHOLD = 80;

export type BrandDto = {
  id: string;
  name: string;
  profileState: ProfileState;
  alertThreshold: number;
  alertState: AlertState;
  alertLastError: string | null;
  slackConfigured: boolean;
  readOnly: boolean;
  createdAt: string;
};

export type MeDto = Me & { brands: BrandDto[] };

export type ProfileDto = {
  state: ProfileState;
  profile: BusinessProfile;
};

export type SourceDto = {
  id: string;
  brandId: string;
  kind: SourceKind;
  name: string;
  state: SourceState;
  address: string | null;
  webhookUrl: string | null;
  lastError: string | null;
  verification: { link: string | null; code: string | null } | null;
  createdAt: string;
};

export type LeadSummaryDto = {
  id: string;
  brandId: string;
  sourceId: string;
  status: LeadStatus;
  stage: LeadStage;
  name: string;
  email: string;
  company: string;
  subject: string;
  score: number | null;
  category: Category | null;
  receivedAt: string;
};

export type LeadEventDto = {
  type: "status" | "stage" | "draft" | "replied" | "feedback";
  from: string | null;
  to: string | null;
  at: string;
};

export type LeadDetailDto = LeadSummaryDto & {
  message: string;
  analysis: Analysis | null;
  draft: string;
  repliedAt: string | null;
  lastError: string | null;
  hasOriginal: boolean;
  events: LeadEventDto[];
};

export type UsageDto = {
  month: string;
  used: number;
  limit: number;
};

export type ApiError = {
  error: string;
  message: string;
};

export type ScheduledChange = { action: "cancel" | "pause" | "resume"; effectiveAt: string };

export type BillingDto = {
  plan: Plan;
  subscription: SubscriptionStatus;
  currentPeriodEnd: string | null;
  pendingPlan: PaidPlan | null;
  trialEndsAt: string | null;
  canStartTrial: boolean;
  hasPaidSubscription: boolean;
  scheduledChange: ScheduledChange | null;
  pastDueSince: string | null;
  isAnalysisPaused: boolean;
  hasCustomer: boolean;
  checkout: {
    environment: "sandbox" | "production";
    clientToken: string | null;
    // The Paddle price of the one $4/month plan.
    priceId: string | null;
  };
};

export const PAST_DUE_GRACE_DAYS = 7;

export type SeatDto = {
  id: string;
  email: string;
  role: "owner" | "member";
  status: "invited" | "active" | "revoked";
  createdAt: string;
};

// CSV export (F9): one row per lead, in this column order.
export const LEAD_CSV_COLUMNS = [
  "id",
  "received_at",
  "source_id",
  "status",
  "stage",
  "name",
  "email",
  "company",
  "subject",
  "message",
  "score",
  "category",
  "summary",
  "draft",
  "replied_at",
] as const;

export type LeadCsvColumn = (typeof LEAD_CSV_COLUMNS)[number];

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

// Public, no session: the sign-in methods this deployment has configured. Google needs its OAuth client env vars.
export const SIGN_IN_OPTIONS_PATH = "/api/sign-in-options";

export type SignInOptionsDto = {
  google: boolean;
};
