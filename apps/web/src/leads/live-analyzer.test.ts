import { describe, expect, it } from "vitest";

import { parseAnalysisJson } from "./live-analyzer";

const VALID_SAMPLE = {
  score: 82,
  category: "hot",
  intent: "new-project",
  budget: "$25k–$40k",
  timeline: "end of Q1",
  decisionMaker: true,
  summary: "SaaS CEO wants an AI support triage agent.",
  reasons: ["Clear budget", "Decision maker"],
  draftReply: "Hi Maya, …",
};

describe("live mode JSON schema", () => {
  it("accepts a valid model reply even when wrapped in a code fence", () => {
    const reply = "```json\n" + JSON.stringify(VALID_SAMPLE) + "\n```";

    expect(parseAnalysisJson(reply)).toEqual(VALID_SAMPLE);
  });

  it("rejects a reply with an unknown category", () => {
    const reply = JSON.stringify({ ...VALID_SAMPLE, category: "very hot" });

    expect(() => parseAnalysisJson(reply)).toThrow(/schema/);
  });

  it("rejects a score outside 0–100", () => {
    const reply = JSON.stringify({ ...VALID_SAMPLE, score: 140 });

    expect(() => parseAnalysisJson(reply)).toThrow(/score/);
  });

  it("rejects a reply with missing fields", () => {
    const { reasons: _reasons, ...rest } = VALID_SAMPLE;

    expect(() => parseAnalysisJson(JSON.stringify(rest))).toThrow(/schema/);
  });

  it("rejects prose with no JSON", () => {
    expect(() => parseAnalysisJson("Sorry, I cannot help.")).toThrow(/no JSON/);
  });
});
