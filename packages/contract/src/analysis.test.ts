import { describe, expect, it } from "vitest";

import { AnalysisContract } from "./analysis";
import { STAGE_TRANSITIONS } from "./domain";

const VALID = {
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

describe("analysis contract", () => {
  it("accepts a complete analysis", () => {
    expect(AnalysisContract.isData(VALID)).toBe(true);
  });

  it("rejects a score outside 0–100", () => {
    expect(AnalysisContract.isData({ ...VALID, score: 101 })).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(AnalysisContract.isData({ ...VALID, category: "lukewarm" })).toBe(false);
  });
});

describe("stage transitions", () => {
  it('lets "not spam" move a spam lead back to new and nowhere else', () => {
    expect(STAGE_TRANSITIONS.spam).toEqual(["new"]);
  });

  it("lets a pitch go back to new and nowhere else", () => {
    expect(STAGE_TRANSITIONS.pitch).toEqual(["new"]);
  });

  it("lets a new lead be set aside as spam or as a pitch", () => {
    expect(STAGE_TRANSITIONS.new).toEqual(expect.arrayContaining(["spam", "pitch"]));
  });

  it("keeps won final", () => {
    expect(STAGE_TRANSITIONS.won).toEqual([]);
  });
});
