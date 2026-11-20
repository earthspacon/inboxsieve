import type { Analysis, Category } from "./analysis";

export type Plan = "solo" | "agency";

export type SubscriptionStatus =
  "no_subscription" | "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";

export const PLAN_LIMITS: Record<Plan, { brands: number; sources: number; leadsPerMonth: number; seats: number }> = {
  solo: {
    brands: 1,
    sources: 2,
    leadsPerMonth: 500,
    seats: 1,
  },
  agency: {
    brands: 10,
    sources: 20,
    leadsPerMonth: 3000,
    seats: 3,
  },
};

export type AccessLevel = "locked" | "read_only" | "full";

export const SUBSCRIPTION_ACCESS: Record<SubscriptionStatus, AccessLevel> = {
  no_subscription: "locked",
  trialing: "full",
  active: "full",
  past_due: "full",
  paused: "read_only",
  canceled: "full",
  expired: "read_only",
};

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

export type LeadStage = "new" | "contacted" | "meeting" | "won" | "lost" | "spam";

export const STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ["contacted", "meeting", "lost", "spam"],
  contacted: ["meeting", "won", "lost"],
  meeting: ["won", "lost"],
  won: [],
  lost: ["new"],
  spam: ["new"],
};

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

export type BrandDto = {
  id: string;
  name: string;
  profileState: ProfileState;
  alertThreshold: number;
  createdAt: string;
};

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
