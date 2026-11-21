import { createSlackPoster, type SlackPoster } from "./alerts/slack";
import type { LeadAnalyzer } from "./analysis/analyzer";
import { createGroqAnalyzer } from "./analysis/groq";
import { ruleAnalyzer } from "./analysis/rules";
import { isDev, type Env } from "./env";
import { createMailer, type Mailer } from "./mailer";

export type Deps = {
  env: Env;
  db: D1Database;
  analyzer: LeadAnalyzer;
  mailer: Mailer;
  slack: SlackPoster;
  now: () => Date;
  schedule: (task: Promise<unknown>) => void;
};

export function createDeps({ env, ctx }: { env: Env; ctx: ExecutionContext }): Deps {
  return {
    env,
    db: env.DB,
    analyzer: createAnalyzer(env),
    mailer: createMailer(env),
    slack: createSlackPoster(),
    now: () => new Date(),
    schedule: (task) => {
      ctx.waitUntil(task);
    },
  };
}

function createAnalyzer(env: Env): LeadAnalyzer {
  if (env.GROQ_API_KEY) {
    return createGroqAnalyzer({ apiKey: env.GROQ_API_KEY, model: env.LLM_MODEL });
  }
  if (isDev(env)) {
    return ruleAnalyzer;
  }
  throw new Error("GROQ_API_KEY is not set");
}
