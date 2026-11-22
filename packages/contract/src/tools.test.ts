import { describe, expect, it } from "vitest";

import type { Analysis } from "./analysis";
import { getVerdict } from "./tools";

const ANALYSIS: Analysis = {
  score: 82,
  category: "hot",
  intent: "new-project",
  budget: "$25k",
  timeline: "by end of Q1",
  decisionMaker: true,
  summary: "Founder wants a support triage agent.",
  reasons: ["Budget fits"],
  draftReply: "Hi Maya",
};

describe("getVerdict", () => {
  it("calls a spam category or a spam intent spam", () => {
    expect(getVerdict({ ...ANALYSIS, category: "spam" })).toBe("spam");
    expect(getVerdict({ ...ANALYSIS, intent: "spam" })).toBe("spam");
  });

  it("calls a vendor or job offer a pitch whatever its score", () => {
    expect(getVerdict({ ...ANALYSIS, intent: "job", score: 90 })).toBe("pitch");
  });

  it("calls a weak partnership offer a pitch and a strong one a request", () => {
    expect(getVerdict({ ...ANALYSIS, intent: "partnership", score: 49 })).toBe("pitch");
    expect(getVerdict({ ...ANALYSIS, intent: "partnership", score: 50 })).toBe("request");
  });

  it("calls a project inquiry a request", () => {
    expect(getVerdict(ANALYSIS)).toBe("request");
  });
});
