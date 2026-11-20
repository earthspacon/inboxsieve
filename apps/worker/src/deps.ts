import type { LeadAnalyzer } from "./analysis/analyzer";
import { createAnthropicAnalyzer } from "./analysis/anthropic";
import { ruleAnalyzer } from "./analysis/rules";
import { isDev, type Env } from "./env";
import { createMailer, type Mailer } from "./mailer";

export type Deps = {
  env: Env;
  db: D1Database;
  analyzer: LeadAnalyzer;
  mailer: Mailer;
  now: () => Date;
  schedule: (task: Promise<unknown>) => void;
};

export function createDeps({ env, ctx }: { env: Env; ctx: ExecutionContext }): Deps {
  return {
    env,
    db: env.DB,
    analyzer: createAnalyzer(env),
    mailer: createMailer(env),
    now: () => new Date(),
    schedule: (task) => {
      ctx.waitUntil(task);
    },
  };
}

function createAnalyzer(env: Env): LeadAnalyzer {
  if (env.ANTHROPIC_API_KEY) {
    return createAnthropicAnalyzer({ apiKey: env.ANTHROPIC_API_KEY });
  }
  if (isDev(env)) {
    return ruleAnalyzer;
  }
  throw new Error("ANTHROPIC_API_KEY is not set");
}
