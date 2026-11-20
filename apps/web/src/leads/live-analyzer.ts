import { AnalysisContract } from './contract';
import { STUDIO_NAME } from './config';
import type { LeadInput } from './config';
import type { LeadAnalyzer } from './analyzer';

export const LIVE_MODEL = 'claude-haiku-5-5';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 1200;

const SYSTEM_PROMPT = `You qualify inbound sales leads for ${STUDIO_NAME}, a small studio that sells AI agents and workflow automation to SMBs ($2k–6k setup + monthly retainer).
Reply with one JSON object only, no prose, matching:
{"score": 0-100 fit score, "category": "hot"|"warm"|"cold"|"spam", "intent": "new-project"|"partnership"|"rfp"|"support"|"job"|"spam"|"other",
"budget": string|null (as written), "timeline": string|null (as written), "decisionMaker": boolean,
"summary": one sentence, "reasons": 2-5 short strings explaining the score,
"draftReply": a short friendly reply email signed "Alex, ${STUDIO_NAME}" ("" for spam)}.
hot >= 75, warm 50-74, cold < 50.`;

export function createLiveAnalyzer({ apiKey }: { apiKey: string }): LeadAnalyzer {
  return {
    analyze: async (input) => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: LIVE_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: formatLead(input) }],
        }),
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

export function parseAnalysisJson(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new Error('Model reply has no JSON object');
  }

  const data: unknown = JSON.parse(text.slice(start, end + 1));

  if (!AnalysisContract.isData(data)) {
    throw new Error(`Model reply does not match the schema: ${AnalysisContract.getErrorMessages(data).join('; ')}`);
  }

  return data;
}

function formatLead(input: LeadInput) {
  return `From: ${input.name} <${input.email}>\nCompany: ${input.company || 'unknown'}\nSubject: ${input.subject}\n\n${input.message}`;
}
