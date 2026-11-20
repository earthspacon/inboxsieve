import type { Analysis, BusinessProfile, LeadInput } from "@inboxsieve/contract";

export type FeedbackExample = {
  kind: "not_spam" | "wrong_score";
  subject: string;
  message: string;
  expectedScore: number | null;
  note: string;
};

export type AnalysisRequest = {
  lead: LeadInput;
  profile: BusinessProfile;
  examples: FeedbackExample[];
};

export type LeadAnalyzer = {
  analyze: (request: AnalysisRequest) => Promise<Analysis>;
};

export const DEFAULT_PROFILE: BusinessProfile = {
  services: "Professional services for small and mid-size businesses",
  idealClient: "A company with a clear project, a budget and a decision maker",
  minBudget: "",
  tone: "Friendly and concise",
  signature: "Best regards",
  bookingLink: "",
};
