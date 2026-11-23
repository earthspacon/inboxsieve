import type { Analysis } from "@inboxsieve/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALERT_RETRY_DELAYS_MS } from "../src/alerts/alerts";
import { createSlackPoster } from "../src/alerts/slack";
import { runQueues } from "../src/leads/jobs";
import { admitLead } from "../src/leads/pipeline";
import { createBrevoMailer } from "../src/mailer";
import { saveAlertSettings } from "../src/repo";
import {
  buildLeadInput,
  buildTestDeps,
  countRows,
  createMockAnalyzer,
  db,
  seedAccount,
  seedSource,
  uniqueEmail,
  VALID_ANALYSIS,
} from "./helpers";

const SLACK_URL = "https://hooks.slack.com/services/T000/B000/example";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

// Brevo and Slack are the only network boundaries; the stub counts calls per host and can fail Slack.
function stubNetwork({ slackStatus = 200 }: { slackStatus?: number } = {}) {
  const calls = {
    mail: 0,
    slack: 0,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === BREVO_URL) {
      calls.mail += 1;
      return Response.json({ messageId: "<example@smtp-relay.mailin.fr>" }, { status: 201 });
    }
    if (url === SLACK_URL) {
      calls.slack += 1;
      return new Response("error", { status: slackStatus });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  return calls;
}

async function setUpBrand() {
  const owner = await seedAccount();
  await db
    .prepare(
      `INSERT INTO seats (id, account_id, user_id, email, role, status, created_at) VALUES (?, ?, NULL, ?, 'member', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), owner.accountId, uniqueEmail("seat"), new Date().toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO seats (id, account_id, user_id, email, role, status, created_at) VALUES (?, ?, NULL, ?, 'member', 'invited', ?)`,
    )
    .bind(crypto.randomUUID(), owner.accountId, uniqueEmail("invited"), new Date().toISOString())
    .run();
  await saveAlertSettings({
    db,
    accountId: owner.accountId,
    brandId: owner.brandId,
    enabled: true,
    threshold: 80,
    slackWebhookUrl: SLACK_URL,
  });
  const source = await seedSource({ brandId: owner.brandId, kind: "webhook" });
  return {
    ...owner,
    sourceId: source.id,
  };
}

async function analyzeLeadWithScore({
  score,
  now,
  intent = VALID_ANALYSIS.intent,
}: {
  score: number;
  now: Date;
  intent?: Analysis["intent"];
}) {
  const brand = await setUpBrand();
  const mock = createMockAnalyzer(() => {
    return {
      ...VALID_ANALYSIS,
      score,
      intent,
      category: score >= 75 ? "hot" : "cold",
    };
  });
  const { deps } = buildTestDeps({ analyzer: mock.analyzer, now: () => now });
  deps.mailer = createBrevoMailer({ apiKey: "xkeysib-test-key", from: "InboxSieve <alerts@inboxsieve.example>" });
  deps.slack = createSlackPoster();
  await admitLead({
    db,
    brandId: brand.brandId,
    sourceId: brand.sourceId,
    dedupeKey: null,
    parsed: { ok: true, lead: buildLeadInput() },
    raw: "raw",
    authResults: null,
    now,
  });
  await runQueues(deps);
  return {
    ...brand,
    deps,
  };
}

function readBrandAlertState(brandId: string) {
  return db
    .prepare("SELECT alert_failed_at, alert_last_error FROM brands WHERE id = ?")
    .bind(brandId)
    .first<{ alert_failed_at: string | null; alert_last_error: string | null }>();
}

describe("F6 hot-lead alerts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("F6: score 85 sends 1 email per active seat and 1 Slack post", async () => {
    const calls = stubNetwork();

    const brand = await analyzeLeadWithScore({ score: 85, now: new Date() });

    expect(calls).toEqual({ mail: 2, slack: 1 });
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM alert_deliveries WHERE brand_id = ? AND status = 'sent'",
        binds: [brand.brandId],
      }),
    ).toBe(3);
  });

  it("F6: score 40 sends nothing", async () => {
    const calls = stubNetwork();

    const brand = await analyzeLeadWithScore({ score: 40, now: new Date() });

    expect(calls).toEqual({ mail: 0, slack: 0 });
    expect(
      await countRows({ sql: "SELECT COUNT(*) AS n FROM alert_deliveries WHERE brand_id = ?", binds: [brand.brandId] }),
    ).toBe(0);
  });

  it("F6: a pitch scored 85 sends nothing", async () => {
    const calls = stubNetwork();

    const brand = await analyzeLeadWithScore({ score: 85, intent: "job", now: new Date() });

    expect(calls).toEqual({ mail: 0, slack: 0 });
    expect(
      await countRows({ sql: "SELECT COUNT(*) AS n FROM alert_deliveries WHERE brand_id = ?", binds: [brand.brandId] }),
    ).toBe(0);
  });

  it("F6: a Slack 500 is retried and becomes delivery_failed after 3 tries", async () => {
    const calls = stubNetwork({ slackStatus: 500 });
    const start = new Date();

    const brand = await analyzeLeadWithScore({ score: 85, now: start });
    const afterFirst = await readBrandAlertState(brand.brandId);
    let at = start.getTime();
    for (const delay of ALERT_RETRY_DELAYS_MS) {
      at += delay;
      const now = new Date(at);
      brand.deps.now = () => now;
      await runQueues(brand.deps);
    }
    const slackRow = await db
      .prepare("SELECT status, attempts FROM alert_deliveries WHERE brand_id = ? AND channel = 'slack'")
      .bind(brand.brandId)
      .first();

    expect(afterFirst?.alert_failed_at).toBeNull();
    expect(calls.slack).toBe(3);
    expect(slackRow).toEqual({ status: "failed", attempts: 3 });
    expect(await readBrandAlertState(brand.brandId)).toMatchObject({ alert_last_error: "Slack: Slack returned 500" });
  });

  it("F6: the same lead re-scored does not alert twice", async () => {
    const calls = stubNetwork();
    const brand = await analyzeLeadWithScore({ score: 90, now: new Date() });
    await db
      .prepare("UPDATE leads SET status = 'queued', next_attempt_at = ? WHERE brand_id = ?")
      .bind(new Date(0).toISOString(), brand.brandId)
      .run();

    await runQueues(brand.deps);

    expect(calls).toEqual({ mail: 2, slack: 1 });
  });

  it("F6: disabled alerts send nothing", async () => {
    const calls = stubNetwork();
    const brand = await setUpBrand();
    await saveAlertSettings({
      db,
      accountId: brand.accountId,
      brandId: brand.brandId,
      enabled: false,
      threshold: 80,
      slackWebhookUrl: null,
    });
    const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
    await admitLead({
      db,
      brandId: brand.brandId,
      sourceId: brand.sourceId,
      dedupeKey: null,
      parsed: { ok: true, lead: buildLeadInput() },
      raw: "raw",
      authResults: null,
      now: new Date(),
    });

    await runQueues(deps);

    expect(calls).toEqual({ mail: 0, slack: 0 });
  });
});
