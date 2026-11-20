import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROFILE } from "../src/analysis/analyzer";
import { createAnthropicAnalyzer } from "../src/analysis/anthropic";
import { parseAnalysisJson } from "../src/analysis/parse";
import { buildLeadInput, VALID_ANALYSIS } from "./helpers";

const REQUEST = {
  lead: buildLeadInput(),
  profile: DEFAULT_PROFILE,
  examples: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

function stubAnthropic(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

describe("Anthropic analyzer (fetch stubbed, no network)", () => {
  it("calls Haiku 5.5 with the key header and a cache breakpoint on the profile block", async () => {
    const fetchSpy = stubAnthropic(
      Response.json({ content: [{ type: "text", text: JSON.stringify(VALID_ANALYSIS) }] }),
    );

    const { analysis } = await createAnthropicAnalyzer({ apiKey: "test-key" }).analyze(REQUEST);

    const [url, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.has("anthropic-dangerous-direct-browser-access")).toBe(false);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.system[0].cache_control).toBeUndefined();
    expect(body.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(analysis).toEqual(VALID_ANALYSIS);
  });

  it("turns an API error into a thrown error so the job retries", async () => {
    stubAnthropic(new Response("overloaded", { status: 529 }));

    await expect(createAnthropicAnalyzer({ apiKey: "test-key" }).analyze(REQUEST)).rejects.toThrow(
      "Anthropic API returned 529",
    );
  });

  it("accepts a valid reply wrapped in a code fence", () => {
    expect(parseAnalysisJson(`\`\`\`json\n${JSON.stringify(VALID_ANALYSIS)}\n\`\`\``)).toEqual(VALID_ANALYSIS);
  });

  it("rejects a reply that breaks the contract", () => {
    expect(() => parseAnalysisJson(JSON.stringify({ ...VALID_ANALYSIS, score: 140 }))).toThrow(/schema/);
  });

  it("rejects prose with no JSON", () => {
    expect(() => parseAnalysisJson("I think this lead is hot.")).toThrow("Model reply has no JSON object");
  });
});
