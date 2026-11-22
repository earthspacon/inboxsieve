import {
  SPAM_CHECKER_IDEAL_CLIENT_MAX_CHARS,
  SPAM_CHECKER_MESSAGE_MAX_CHARS,
  SPAM_CHECKER_RUNS_PER_DAY,
  WARM_SCORE,
  type Analysis,
  type LeadInput,
  type SpamCheckResultDto,
  type SpamCheckVerdict,
} from "@inboxsieve/contract";

import { DEFAULT_PROFILE } from "../analysis/analyzer";
import { readLlmBudget } from "../analysis/budget";
import { RateLimitedError } from "../analysis/groq";
import { buildSpamAnalysis, isRuleSpam } from "../analysis/rules";
import type { Deps } from "../deps";
import { HttpError, json, readJson, readString } from "../http";
import { getUtcDay } from "../leads/jobs";
import { addLlmSpend, consumeRateLimit, getLlmSpend } from "../repo";
import { readClientIp, sha256Hex } from "../shield/client";
import { TURNSTILE_HEADER, verifyTurnstile } from "../shield/turnstile";

// llm_spend needs an account id; the public tool's cost is booked here so the global cap sees it.
const SPEND_ACCOUNT_ID = "public-spam-checker";
const RUN_WINDOW_MS = 24 * 60 * 60_000;
const BUSY_MESSAGE = "The checker is busy right now. Try again in a few hours";

// Runs the product's own spam rules and scoring on a pasted message. Nothing from the request is written to D1:
// only a hashed-IP rate-limit hit and the AI cost in USD.
export async function handleSpamCheck({ deps, request }: { deps: Deps; request: Request }) {
  const input = await readSpamCheckInput(request);
  const ip = readClientIp(request);

  const isHuman = await verifyTurnstile({
    secret: deps.env.TURNSTILE_SECRET_KEY,
    token: request.headers.get(TURNSTILE_HEADER),
    ip,
  });
  if (!isHuman) {
    throw new HttpError(403, "captcha_failed", "We couldn't confirm you're human. Reload the page and try again");
  }

  const now = deps.now();
  const isAllowed = await consumeRateLimit({
    db: deps.db,
    key: `spam-checker:ip:${await sha256Hex(ip ?? "unknown")}`,
    limit: SPAM_CHECKER_RUNS_PER_DAY,
    windowMs: RUN_WINDOW_MS,
    now,
  });
  if (!isAllowed) {
    throw new HttpError(
      429,
      "rate_limited",
      `You've used today's ${SPAM_CHECKER_RUNS_PER_DAY} free checks. Come back tomorrow, or start free to check every message`,
    );
  }

  const lead: LeadInput = {
    name: "",
    email: "",
    company: "",
    subject: "",
    message: input.message,
  };
  if (isRuleSpam(lead)) {
    return json(buildSpamCheckResult(buildSpamAnalysis()));
  }

  const day = getUtcDay(now);
  const budget = readLlmBudget({ env: deps.env, mailer: deps.mailer });
  if ((await getLlmSpend({ db: deps.db, day, accountId: null })) >= budget.dailyCapUsd) {
    throw new HttpError(503, "busy", BUSY_MESSAGE);
  }

  const { analysis, costUsd } = await deps.analyzer
    .analyze({
      lead,
      profile: {
        ...DEFAULT_PROFILE,
        idealClient: input.idealClient || DEFAULT_PROFILE.idealClient,
      },
      examples: [],
    })
    .catch((error: unknown) => {
      if (error instanceof RateLimitedError) {
        throw new HttpError(503, "busy", BUSY_MESSAGE);
      }
      throw error;
    });
  if (costUsd > 0) {
    await addLlmSpend({
      db: deps.db,
      day,
      accountId: SPEND_ACCOUNT_ID,
      usd: costUsd,
    });
  }
  return json(buildSpamCheckResult(analysis));
}

async function readSpamCheckInput(request: Request) {
  const data = await readJson(request);
  const message = readString({
    data,
    key: "message",
    maxLength: SPAM_CHECKER_MESSAGE_MAX_CHARS,
  }).trim();
  const idealClient = readString({
    data,
    key: "idealClient",
    maxLength: SPAM_CHECKER_IDEAL_CLIENT_MAX_CHARS,
  }).trim();

  if (!message) {
    throw new HttpError(400, "invalid_field", "Paste a message to check");
  }
  return {
    message,
    idealClient,
  };
}

function buildSpamCheckResult(analysis: Analysis): SpamCheckResultDto {
  return {
    verdict: getVerdict(analysis),
    score: analysis.score,
    summary: analysis.summary,
    reasons: analysis.reasons,
  };
}

// Vendor and partnership offers with a low fit are what people call "sales pitches" in their form mail.
function getVerdict(analysis: Analysis): SpamCheckVerdict {
  if (analysis.category === "spam" || analysis.intent === "spam") {
    return "spam";
  }
  if (analysis.intent === "job" || (analysis.intent === "partnership" && analysis.score < WARM_SCORE)) {
    return "pitch";
  }
  return "request";
}
