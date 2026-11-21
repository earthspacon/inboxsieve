import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROFILE } from "../src/analysis/analyzer";
import { createGroqAnalyzer, RateLimitedError } from "../src/analysis/groq";
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

function stubGroq(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

describe("Groq analyzer (fetch stubbed, no network)", () => {
  it("calls gpt-oss-120b with the bearer key, json mode and turns usage into cost", async () => {
    const fetchSpy = stubGroq(
      Response.json({
        choices: [{ message: { content: JSON.stringify(VALID_ANALYSIS) } }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
      }),
    );

    const { analysis, costUsd } = await createGroqAnalyzer({ apiKey: "test-key" }).analyze(REQUEST);

    const [url, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
    expect(analysis).toEqual(VALID_ANALYSIS);
    expect(costUsd).toBeCloseTo(0.75, 6);
  });

  it("uses the LLM_MODEL override", async () => {
    const fetchSpy = stubGroq(Response.json({ choices: [{ message: { content: JSON.stringify(VALID_ANALYSIS) } }] }));

    await createGroqAnalyzer({ apiKey: "test-key", model: "openai/gpt-oss-20b" }).analyze(REQUEST);

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).model).toBe("openai/gpt-oss-20b");
  });

  it("turns an API error into a thrown error so the job retries", async () => {
    stubGroq(new Response("overloaded", { status: 503 }));

    await expect(createGroqAnalyzer({ apiKey: "test-key" }).analyze(REQUEST)).rejects.toThrow("Groq API returned 503");
  });

  it("throws RateLimitedError with the retry-after delay on 429", async () => {
    stubGroq(new Response("slow down", { status: 429, headers: { "retry-after": "7" } }));

    const error = await createGroqAnalyzer({ apiKey: "test-key" })
      .analyze(REQUEST)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterMs).toBe(7000);
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
