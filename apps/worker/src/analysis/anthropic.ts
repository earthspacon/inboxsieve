import type { LeadAnalyzer } from './analyzer';
import { parseAnalysisJson } from './parse';
import { buildAnalysisPrompt } from './prompt';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export function createAnthropicAnalyzer({ apiKey }: { apiKey: string }): LeadAnalyzer {
  return {
    analyze: async (request) => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(buildAnalysisPrompt(request)),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API returned ${response.status}`);
      }

      const body: { content?: Array<{ type: string; text?: string }> } = await response.json();
      const text = body.content?.find((block) => block.type === 'text')?.text ?? '';

      return parseAnalysisJson(text);
    },
  };
}
