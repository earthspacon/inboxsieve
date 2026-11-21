import type { AnalysisRequest, FeedbackExample } from "./analyzer";

export const ANALYSIS_MODEL = "openai/gpt-oss-120b";
export const MAX_OUTPUT_TOKENS = 1200;
const EXAMPLE_MESSAGE_CHARS = 600;
const LEAD_MESSAGE_CHARS = 8000;

export const SYSTEM_PROMPT = `You qualify inbound sales inquiries for the business described in the profile below.
Reply with one JSON object only, no prose, matching:
{"score": 0-100 fit score, "category": "hot"|"warm"|"cold"|"spam", "intent": "new-project"|"partnership"|"rfp"|"support"|"job"|"spam"|"other",
"budget": string|null (as written), "timeline": string|null (as written), "decisionMaker": boolean,
"summary": one sentence, "reasons": 2-5 short strings explaining the score,
"draftReply": a short reply email in the profile's tone, ending with the profile's signature ("" for spam)}.
hot >= 75, warm 50-74, cold < 50. Score against the profile: services offered, ideal client and minimum budget.
If the profile has a booking link and the lead is hot or warm, offer it in the reply.`;

export type ChatCompletionBody = {
  model: string;
  max_completion_tokens: number;
  response_format: { type: "json_object" };
  reasoning_effort: "low";
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export function buildAnalysisPrompt({ lead, profile, examples }: AnalysisRequest): ChatCompletionBody {
  return {
    model: ANALYSIS_MODEL,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n${buildProfileBlock({ profile, examples })}`,
      },
      {
        role: "user",
        content: `From: ${lead.name} <${lead.email}>\nCompany: ${lead.company || "unknown"}\nSubject: ${lead.subject}\n\n${lead.message.slice(0, LEAD_MESSAGE_CHARS)}`,
      },
    ],
  };
}

function buildProfileBlock({ profile, examples }: Pick<AnalysisRequest, "profile" | "examples">) {
  const lines = [
    "Business profile:",
    `- Services: ${profile.services}`,
    `- Ideal client: ${profile.idealClient}`,
    `- Minimum budget: ${profile.minBudget || "not set"}`,
    `- Tone: ${profile.tone}`,
    `- Signature: ${profile.signature}`,
    `- Booking link: ${profile.bookingLink || "none"}`,
  ];

  if (examples.length === 0) {
    return lines.join("\n");
  }

  const exampleLines = examples.map((example) => {
    const note = example.note ? ` (${example.note})` : "";
    return `- "${example.subject}": ${example.message.slice(0, EXAMPLE_MESSAGE_CHARS)} → ${describeVerdict(example)}${note}`;
  });

  return [...lines, "", "Corrections from this business (follow them):", ...exampleLines].join("\n");
}

function describeVerdict(example: FeedbackExample) {
  if (example.kind === "not_spam") {
    return "NOT spam";
  }
  return `score should be ${example.expectedScore ?? "different"}`;
}
