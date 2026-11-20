import type { Analysis, LeadInput, PaidPlan, SourceKind, SubscriptionStatus } from "@inboxsieve/contract";
import { env } from "cloudflare:test";

import type { AnalysisRequest, LeadAnalyzer } from "../src/analysis/analyzer";
import type { Deps } from "../src/deps";
import type { InboundEmail } from "../src/ingest/email";
import { createSlackPoster } from "../src/alerts/slack";
import { createLogMailer } from "../src/mailer";
import { createAccount, createSource } from "../src/repo";

export const db = env.DB;

export const VALID_ANALYSIS: Analysis = {
  score: 82,
  category: "hot",
  intent: "new-project",
  budget: "$25k",
  timeline: "by end of Q1",
  decisionMaker: true,
  summary: "Founder wants a support triage agent.",
  reasons: ["Budget fits", "Clear timeline"],
  draftReply: "Hi there,\n\nThanks for reaching out.\n\nBest regards",
};

export function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@agency.example`;
}

export async function seedAccount({
  email = uniqueEmail("owner"),
  plan = "solo",
  status = "trialing",
}: {
  email?: string;
  plan?: PaidPlan;
  status?: SubscriptionStatus;
} = {}) {
  const userId = crypto.randomUUID();
  const at = new Date().toISOString();

  await db
    .prepare(`INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, '', ?, 1, ?, ?)`)
    .bind(userId, email, at, at)
    .run();
  const accountId = await createAccount({
    db,
    userId,
    email,
    plan,
    status,
    now: new Date(),
  });
  const brand = await db.prepare("SELECT id FROM brands WHERE account_id = ?").bind(accountId).first<{ id: string }>();

  if (!brand) {
    throw new Error("seedAccount: brand missing");
  }
  return {
    email,
    userId,
    accountId,
    brandId: brand.id,
  };
}

export async function seedSource({ brandId, kind }: { brandId: string; kind: SourceKind }) {
  const row = await createSource({
    db,
    brandId,
    brandName: "Acme Studio",
    kind,
    name: "Test source",
    inboundDomain: "in.inboxsieve.example",
    now: new Date(),
  });

  if (!row) {
    throw new Error("seedSource: source missing");
  }
  return row;
}

export function createMockAnalyzer(reply: (request: AnalysisRequest) => unknown = () => VALID_ANALYSIS) {
  const calls: AnalysisRequest[] = [];
  const analyzer: LeadAnalyzer = {
    analyze: async (request) => {
      calls.push(request);
      const result: unknown = reply(request);
      if (!isAnalysisShaped(result)) {
        return Promise.reject(new Error("mock reply is not an object"));
      }
      return result;
    },
  };
  return {
    analyzer,
    calls,
  };
}

export function buildInboundEmail({
  raw,
  to,
  from = "forwarder@agency.example",
}: {
  raw: string;
  to: string;
  from?: string;
}) {
  const bytes = new TextEncoder().encode(raw);
  const message: InboundEmail & { rejectedWith: string | null } = {
    from,
    to,
    rawSize: bytes.byteLength,
    raw: new Blob([bytes]).stream(),
    rejectedWith: null,
    setReject: (reason) => {
      message.rejectedWith = reason;
    },
  };
  return message;
}

export function buildTestDeps({ analyzer, now = () => new Date() }: { analyzer: LeadAnalyzer; now?: () => Date }) {
  const scheduled: Array<Promise<unknown>> = [];
  const deps: Deps = {
    env,
    db,
    analyzer,
    mailer: createLogMailer({ db }),
    slack: createSlackPoster(),
    now,
    schedule: (task) => {
      scheduled.push(task);
    },
  };
  return {
    deps,
    scheduled,
  };
}

export function buildLeadInput(overrides: Partial<LeadInput> = {}): LeadInput {
  return {
    name: "Dana Reyes",
    email: "dana@northwind.example",
    company: "Northwind",
    subject: "Website rebuild",
    message: "We need a new marketing site with a CMS. Budget is $12k, launch within 6 weeks.",
    ...overrides,
  };
}

export async function countRows({ sql, binds }: { sql: string; binds: unknown[] }) {
  const row = await db
    .prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function isAnalysisShaped(value: unknown): value is Analysis {
  return typeof value === "object" && value !== null;
}
