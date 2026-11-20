import { CATEGORY_CONFIG, HOT_SCORE, INTENT_LABELS, STUDIO_NAME, WARM_SCORE } from "./config";
import type { Analysis, Category, Intent, LeadInput } from "./config";

export type LeadAnalyzer = {
  analyze: (input: LeadInput) => Promise<Analysis>;
};

export const DEMO_THINKING_MS = 1200;

const BASE_SCORE = 20;
const SPAM_SCORE = 2;
const BIG_BUDGET_USD = 20_000;
const MID_BUDGET_USD = 5_000;

const SPAM_PATTERNS = [
  /backlinks?/i,
  /guest post/i,
  /rank (#|number )?1/i,
  /crypto/i,
  /seo (services|package)/i,
  /dear (sir|madam)/i,
  /investment opportunity/i,
  /click here/i,
];

const INTENT_PATTERNS: Array<{ intent: Intent; pattern: RegExp }> = [
  {
    intent: "rfp",
    pattern: /\b(rfp|request for proposal|procurement|vendor selection|tender)\b/i,
  },
  {
    intent: "partnership",
    pattern: /\b(partner(ship)?|white[- ]label|referral|subcontract|overflow work)\b/i,
  },
  {
    intent: "job",
    pattern:
      /\b(hire me|my portfolio|looking for (a )?(job|position)|offshore team|our developers? (are|is) available)\b/i,
  },
  {
    intent: "support",
    pattern: /\b(bug|broken|not working|fix (my|our)|plugin|theme)\b/i,
  },
  {
    intent: "new-project",
    pattern: /\b(build|automate|automation|agent|mvp|integrat\w*|workflow|app|platform|dashboard)\b/i,
  },
];

const FIT_PATTERNS = [/\bai\b/i, /automat/i, /\bagent/i, /\bmvp\b/i, /\bsaas\b/i, /\bcrm\b/i, /workflow/i, /integrat/i];
const MAX_FIT_POINTS = 15;
const FIT_POINTS = 5;

const LOW_FIT_PATTERNS = [
  /\bcheap(est)?\b/i,
  /\bfor free\b/i,
  /\bequity only\b/i,
  /\bunpaid\b/i,
  /\blogo\b/i,
  /\bwordpress\b/i,
];

const DECISION_MAKER_PATTERN = /\b(founder|co-founder|ceo|cto|coo|owner|head of|vp|director|managing partner)\b/i;

const TIMELINE_PATTERNS = [
  /\b(within|in) (the next )?\d+\s?(days?|weeks?|months?)\b/i,
  /\bby (the )?(end of )?(q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|next month|this quarter)\b/i,
  /\b(next|this) (month|quarter)\b/i,
  /\b(asap|urgent(ly)?|right away)\b/i,
];

const URGENT_PATTERN = /\b(asap|urgent(ly)?|right away)\b/i;

const BUDGET_PATTERN = /([$€£])\s?(\d+(?:[.,]\d+)?)\s?(k|K)?(?:\s?(?:-|–|to)\s?[$€£]?\s?(\d+(?:[.,]\d+)?)\s?(k|K)?)?/;

const THOUSAND = 1000;

export const demoAnalyzer: LeadAnalyzer = {
  analyze: async (input) => {
    await new Promise((resolve) => {
      return setTimeout(resolve, DEMO_THINKING_MS);
    });
    return analyzeLead(input);
  },
};

export function analyzeLead(input: LeadInput): Analysis {
  const text = `${input.subject}\n${input.message}`;

  if (SPAM_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildSpamAnalysis(input);
  }

  const intent = detectIntent(text);
  const budget = extractBudget(text);
  const timeline = extractTimeline(text);
  const decisionMaker = DECISION_MAKER_PATTERN.test(text);
  const reasons: string[] = [];
  let score = BASE_SCORE;

  if (budget && budget.usd >= BIG_BUDGET_USD) {
    score += 35;
    reasons.push(`Budget ${budget.label} fits the AI agent package`);
  }
  if (budget && budget.usd >= MID_BUDGET_USD && budget.usd < BIG_BUDGET_USD) {
    score += 25;
    reasons.push(`Budget ${budget.label} covers a setup project`);
  }
  if (budget && budget.usd < MID_BUDGET_USD) {
    score += 5;
    reasons.push(`Budget ${budget.label} is below our minimum`);
  }
  if (!budget) {
    reasons.push("No budget mentioned");
  }

  if (timeline) {
    score += URGENT_PATTERN.test(timeline) ? 10 : 15;
    reasons.push(`Concrete timeline: ${timeline}`);
  }

  if (decisionMaker) {
    score += 10;
    reasons.push("Written by a decision maker");
  }

  const fitPoints = Math.min(FIT_PATTERNS.filter((pattern) => pattern.test(text)).length * FIT_POINTS, MAX_FIT_POINTS);
  if (fitPoints > 0) {
    score += fitPoints;
    reasons.push("Asks for AI / automation work we sell");
  }

  if (intent === "rfp") {
    score += 10;
    reasons.push("Formal RFP: larger deal, longer cycle");
  }
  if (intent === "partnership") {
    score += 15;
    reasons.push("Agency partner: a channel for repeat projects");
  }
  if (intent === "job" || intent === "support") {
    score -= 20;
    reasons.push(`${INTENT_LABELS[intent]}, not a buyer`);
  }
  if (LOW_FIT_PATTERNS.some((pattern) => pattern.test(text))) {
    score -= 25;
    reasons.push("Low-budget or off-scope request");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const category = getCategory(finalScore);

  return {
    score: finalScore,
    category,
    intent,
    budget: budget?.label ?? null,
    timeline,
    decisionMaker,
    summary: buildSummary({
      input,
      intent,
      category,
      budget: budget?.label ?? null,
      timeline,
    }),
    reasons,
    draftReply: buildDraftReply({
      input,
      category,
      intent,
      timeline,
    }),
  };
}

export function getCategory(score: number): Category {
  if (score >= HOT_SCORE) {
    return "hot";
  }
  if (score >= WARM_SCORE) {
    return "warm";
  }
  return "cold";
}

export function extractBudget(text: string): { label: string; usd: number } | null {
  const match = BUDGET_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  const [label, , from, fromK, to, toK] = match;
  const isThousands = Boolean(fromK ?? toK);
  const toAmount = (value: string) => {
    return Number(value.replace(",", "")) * (isThousands ? THOUSAND : 1);
  };
  const usd = to ? toAmount(to) : toAmount(from);

  return {
    label: label.trim(),
    usd,
  };
}

export function extractTimeline(text: string): string | null {
  for (const pattern of TIMELINE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return match[0];
    }
  }
  return null;
}

function detectIntent(text: string): Intent {
  return INTENT_PATTERNS.find(({ pattern }) => pattern.test(text))?.intent ?? "other";
}

function buildSpamAnalysis(input: LeadInput): Analysis {
  return {
    score: SPAM_SCORE,
    category: "spam",
    intent: "spam",
    budget: null,
    timeline: null,
    decisionMaker: false,
    summary: `Unsolicited pitch from ${input.email}. No buying intent.`,
    reasons: ["Matches spam patterns (SEO / link selling / generic greeting)", "Archive without reply"],
    draftReply: "",
  };
}

function buildSummary({
  input,
  intent,
  category,
  budget,
  timeline,
}: {
  input: LeadInput;
  intent: Intent;
  category: Category;
  budget: string | null;
  timeline: string | null;
}) {
  const facts = [
    `${CATEGORY_CONFIG[category].label} lead`,
    INTENT_LABELS[intent],
    input.company,
    budget && `budget ${budget}`,
    timeline,
  ];
  return facts.filter(Boolean).join(" · ");
}

function buildDraftReply({
  input,
  category,
  intent,
  timeline,
}: {
  input: LeadInput;
  category: Category;
  intent: Intent;
  timeline: string | null;
}) {
  const firstName = input.name.split(" ")[0];
  const company = input.company || "your team";
  const body = getReplyBody({
    category,
    intent,
    company,
    timeline,
  });

  return `Hi ${firstName},\n\nThanks for reaching out about “${input.subject}”.\n\n${body}\n\nBest,\nAlex\n${STUDIO_NAME}`;
}

function getReplyBody({
  category,
  intent,
  company,
  timeline,
}: {
  category: Category;
  intent: Intent;
  company: string;
  timeline: string | null;
}) {
  if (intent === "partnership") {
    return `We work with a few agencies on overflow and white-label projects, and ${company} sounds like a good match. Could we do a 20-minute call next week to compare how we scope and hand off work?`;
  }
  if (intent === "rfp") {
    return `We'd be glad to respond to the RFP. Please send the full document and the evaluation timeline; we'll confirm our intent to bid within two business days and list any clarifying questions.`;
  }
  if (intent === "job") {
    return `We're not hiring or adding vendors at the moment, but we'll keep your details on file and reach out if that changes.`;
  }
  if (category === "hot") {
    const when = timeline ? `, and your timeline (${timeline}) works for us` : "";
    return `This is exactly the kind of work we do: AI agents and automations for teams like ${company}. The scope you describe is a good fit${when}. Are you free for a 30-minute call this week? I'll bring a rough plan and a fixed-price estimate.`;
  }
  if (category === "warm") {
    return `It sounds like something we can help ${company} with. To give you a useful estimate, could you share your rough budget, the tools you use today, and when you'd like this live?`;
  }
  return `At the moment this falls outside what we usually take on, so we may not be the best fit. If the scope grows into automation or an AI agent, we'd be happy to talk again.`;
}
