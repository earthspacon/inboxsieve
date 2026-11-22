import { WARM_SCORE, type Analysis } from "./analysis";

// The free contact-form spam checker: public, no sign-in, nothing it receives is stored.
export const SPAM_CHECKER_PAGE_PATH = "/tools/contact-form-spam-checker";
export const SPAM_CHECKER_API_PATH = "/api/tools/contact-form-spam-checker";
export const SPAM_CHECKER_RUNS_PER_DAY = 10;
export const SPAM_CHECKER_MESSAGE_MAX_CHARS = 5000;
export const SPAM_CHECKER_IDEAL_CLIENT_MAX_CHARS = 500;

export type SpamCheckVerdict = "spam" | "pitch" | "request";

export type SpamCheckInput = {
  message: string;
  idealClient: string;
};

export type SpamCheckResultDto = {
  verdict: SpamCheckVerdict;
  score: number;
  summary: string;
  reasons: string[];
};

// One classifier for the free checker and the lead pipeline.
// Vendor and partnership offers with a low fit are what people call "sales pitches" in their form mail.
export function getVerdict(analysis: Analysis): SpamCheckVerdict {
  if (analysis.category === "spam" || analysis.intent === "spam") {
    return "spam";
  }
  if (analysis.intent === "job" || (analysis.intent === "partnership" && analysis.score < WARM_SCORE)) {
    return "pitch";
  }
  return "request";
}
