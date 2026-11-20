import { and, arr, bool, num, obj, or, str, val, type Contract } from "@withease/contracts";

export type Category = "hot" | "warm" | "cold" | "spam";
export type Intent = "new-project" | "partnership" | "rfp" | "support" | "job" | "spam" | "other";

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

export const MAX_SCORE = 100;
export const HOT_SCORE = 75;
export const WARM_SCORE = 50;

const nullableStr = or(str, val(null));

const scoreInRange: Contract<number, number> = {
  isData: (value): value is number => value >= 0 && value <= MAX_SCORE,
  getErrorMessages: (value) => {
    return [`expected a score from 0 to ${MAX_SCORE}, got ${value}`];
  },
};

export const AnalysisContract: Contract<unknown, Analysis> = obj({
  score: and(num, scoreInRange),
  category: or(val("hot"), val("warm"), val("cold"), val("spam")),
  intent: or(val("new-project"), val("partnership"), val("rfp"), val("support"), val("job"), val("spam"), val("other")),
  budget: nullableStr,
  timeline: nullableStr,
  decisionMaker: bool,
  summary: str,
  reasons: arr(str),
  draftReply: str,
});
