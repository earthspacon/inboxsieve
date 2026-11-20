import type { LeadAnalyzer } from "./analyzer";
import { parseAnalysisJson } from "./parse";
import { buildAnalysisPrompt } from "./prompt";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
// Haiku 5.5 list prices in USD per token (spec product-01 §0). Cache writes bill at 1.25× input.
const USD_PER_TOKEN = {
  input: 0.1 / 1_000_000,
  cacheWrite: 0.125 / 1_000_000,
  cacheRead: 0.01 / 1_000_000,
  output: 0.5 / 1_000_000,
};

type Usage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

export function createAnthropicAnalyzer({ apiKey }: { apiKey: string }): LeadAnalyzer {
  return {
    analyze: async (request) => {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(buildAnalysisPrompt(request)),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API returned ${response.status}`);
      }

      const body: { content?: Array<{ type: string; text?: string }>; usage?: Usage } = await response.json();
      const text = body.content?.find((block) => block.type === "text")?.text ?? "";

      return {
        analysis: parseAnalysisJson(text),
        costUsd: calculateCostUsd(body.usage ?? {}),
      };
    },
  };
}

export function calculateCostUsd(usage: Usage) {
  return (
    (usage.input_tokens ?? 0) * USD_PER_TOKEN.input +
    (usage.cache_creation_input_tokens ?? 0) * USD_PER_TOKEN.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * USD_PER_TOKEN.cacheRead +
    (usage.output_tokens ?? 0) * USD_PER_TOKEN.output
  );
}
