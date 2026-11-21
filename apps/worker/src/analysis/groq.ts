import type { LeadAnalyzer } from "./analyzer";
import { parseAnalysisJson } from "./parse";
import { ANALYSIS_MODEL, buildAnalysisPrompt } from "./prompt";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_RETRY_AFTER_MS = 60_000;
// openai/gpt-oss-120b list prices in USD per token (groq.com/pricing): $0.15 / 1M input, $0.60 / 1M output.
const USD_PER_TOKEN = {
  input: 0.15 / 1_000_000,
  output: 0.6 / 1_000_000,
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

// Groq answered 429: the lead waits in the queue instead of burning a retry attempt.
export class RateLimitedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Groq rate limit reached");
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function createGroqAnalyzer({
  apiKey,
  model = ANALYSIS_MODEL,
}: {
  apiKey: string;
  model?: string;
}): LeadAnalyzer {
  return {
    analyze: async (request) => {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...buildAnalysisPrompt(request), model }),
      });

      if (response.status === 429) {
        throw new RateLimitedError(parseRetryAfterMs(response.headers.get("retry-after")));
      }
      if (!response.ok) {
        throw new Error(`Groq API returned ${response.status}`);
      }

      const body: { choices?: Array<{ message?: { content?: string } }>; usage?: Usage } = await response.json();
      const text = body.choices?.[0]?.message?.content ?? "";

      return {
        analysis: parseAnalysisJson(text),
        costUsd: calculateCostUsd(body.usage ?? {}),
      };
    },
  };
}

export function calculateCostUsd(usage: Usage) {
  return (usage.prompt_tokens ?? 0) * USD_PER_TOKEN.input + (usage.completion_tokens ?? 0) * USD_PER_TOKEN.output;
}

function parseRetryAfterMs(header: string | null) {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}
