import { describe, expect, it } from "vitest";

import { RateLimitedError } from "../src/analysis/groq";
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, processLead, runDueJobs } from "../src/leads/jobs";
import { admitLead } from "../src/leads/pipeline";
import { getLead } from "../src/repo";
import { buildLeadInput, countRows, createMockAnalyzer, db, seedAccount, seedSource, VALID_ANALYSIS } from "./helpers";
import { SEED_LEADS } from "./seed-leads";

const RULE_SPAM_IDS = ["seed-seo-spam", "seed-crypto"];
const SOLO_MONTHLY_LIMIT = 500;

async function admit({
  brandId,
  sourceId,
  dedupeKey = null,
  now = new Date(),
  lead = buildLeadInput(),
}: {
  brandId: string;
  sourceId: string;
  dedupeKey?: string | null;
  now?: Date;
  lead?: ReturnType<typeof buildLeadInput>;
}) {
  return admitLead({
    db,
    brandId,
    sourceId,
    dedupeKey,
    parsed: { ok: true, lead },
    raw: "raw body",
    authResults: null,
    now,
  });
}

describe("F4 lead processing", () => {
  it("F4: rule spam among the 12 seed leads is spam_filtered with 0 LLM calls, the rest are analyzed", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    const { analyzer, calls } = createMockAnalyzer();
    const statuses = new Map<string, string>();

    for (const seed of SEED_LEADS) {
      const result = await admit({
        brandId,
        sourceId: source.id,
        lead: seed,
        dedupeKey: seed.id,
      });
      statuses.set(seed.id, result.status);
    }
    await runDueJobs({ db, analyzer, now: new Date() });

    for (const id of RULE_SPAM_IDS) {
      expect(statuses.get(id)).toBe("spam_filtered");
    }
    expect(calls.map((call) => call.lead.email)).not.toContain("offers@rank-masters.example");
    expect(calls.map((call) => call.lead.email)).not.toContain("vlane@moonyield.example");
    const seedEmails = new Set(SEED_LEADS.map((seed) => seed.email));
    expect(calls.filter((call) => seedEmails.has(call.lead.email))).toHaveLength(
      SEED_LEADS.length - RULE_SPAM_IDS.length,
    );
    expect(
      await countRows({
        sql: `SELECT COUNT(*) AS n FROM leads WHERE brand_id = ? AND status = 'analyzed'`,
        binds: [brandId],
      }),
    ).toBe(SEED_LEADS.length - RULE_SPAM_IDS.length);
    expect(
      await countRows({
        sql: `SELECT COUNT(*) AS n FROM leads WHERE brand_id = ? AND status = 'spam_filtered' AND stage = 'spam'`,
        binds: [brandId],
      }),
    ).toBe(RULE_SPAM_IDS.length);
  });

  it("F4: a lead walks received → parsed → queued → analyzing → analyzed and keeps the draft", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    const { analyzer } = createMockAnalyzer();
    const { leadId } = await admit({ brandId, sourceId: source.id });

    await runDueJobs({ db, analyzer, now: new Date() });

    const { results } = await db
      .prepare(`SELECT to_value FROM lead_events WHERE lead_id = ? AND type = 'status' ORDER BY id`)
      .bind(leadId)
      .all<{ to_value: string }>();
    const lead = await getLead({ db, brandId, leadId });
    expect(results.map((row) => row.to_value)).toEqual(["received", "parsed", "queued", "analyzing", "analyzed"]);
    expect(lead?.score).toBe(VALID_ANALYSIS.score);
    expect(lead?.draft).toBe(VALID_ANALYSIS.draftReply);
  });

  it("F4: an invalid contract 3 times with backoff ends in analysis_failed", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    const { analyzer, calls } = createMockAnalyzer(() => ({ ...VALID_ANALYSIS, category: "lukewarm" }));
    const start = new Date("2026-11-20T10:00:00.000Z");
    const { leadId } = await admit({ brandId, sourceId: source.id, now: start });

    await processLead({ db, analyzer, brandId, leadId, now: start });
    const tooEarly = new Date(start.getTime() + RETRY_DELAYS_MS[0] - 1);
    expect(await processLead({ db, analyzer, brandId, leadId, now: tooEarly })).toBeNull();

    const second = new Date(start.getTime() + RETRY_DELAYS_MS[0]);
    await processLead({ db, analyzer, brandId, leadId, now: second });
    const third = new Date(second.getTime() + RETRY_DELAYS_MS[1]);
    await processLead({ db, analyzer, brandId, leadId, now: third });

    const lead = await getLead({ db, brandId, leadId });
    expect(calls).toHaveLength(MAX_ATTEMPTS);
    expect(lead?.status).toBe("analysis_failed");
    expect(lead?.last_error).toMatch(/contract/);
  });

  it("F4: a Groq 429 keeps the lead queued, never analysis_failed, and does not burn attempts", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    const { analyzer } = createMockAnalyzer(() => {
      throw new RateLimitedError(60_000);
    });
    const start = new Date("2026-11-20T10:00:00.000Z");
    const { leadId } = await admit({ brandId, sourceId: source.id, now: start });

    let now = start;
    for (let round = 0; round < MAX_ATTEMPTS + 2; round += 1) {
      await processLead({ db, analyzer, brandId, leadId, now });
      now = new Date(now.getTime() + 60_000);
    }

    const lead = await getLead({ db, brandId, leadId });
    expect(lead?.status).toBe("queued");
    expect(lead?.attempts).toBe(0);
    expect(lead?.last_error).toMatch(/rate limit/i);
  });

  it("F4: an LLM error is retried and a later success still ends analyzed", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    let attempt = 0;
    const { analyzer } = createMockAnalyzer(() => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("Groq API returned 503");
      }
      return VALID_ANALYSIS;
    });
    const start = new Date("2026-11-20T10:00:00.000Z");
    const { leadId } = await admit({ brandId, sourceId: source.id, now: start });

    await processLead({ db, analyzer, brandId, leadId, now: start });
    await processLead({ db, analyzer, brandId, leadId, now: new Date(start.getTime() + RETRY_DELAYS_MS[0]) });

    expect((await getLead({ db, brandId, leadId }))?.status).toBe("analyzed");
  });

  it("F4: the same Message-ID twice creates 1 lead", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "email" });

    const first = await admit({ brandId, sourceId: source.id, dedupeKey: "msg:<abc@mail.example>" });
    const second = await admit({ brandId, sourceId: source.id, dedupeKey: "msg:<abc@mail.example>" });

    expect(second.duplicate).toBe(true);
    expect(second.leadId).toBe(first.leadId);
    expect(second.status).toBe(first.status);
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM leads WHERE brand_id = ?", binds: [brandId] })).toBe(1);
  });

  it("F4: the 501st Solo lead in a month is over_quota and is never analyzed", async () => {
    const { brandId } = await seedAccount({ plan: "solo" });
    const source = await seedSource({ brandId, kind: "webhook" });
    const now = new Date();
    const at = now.toISOString();
    const statements = Array.from({ length: SOLO_MONTHLY_LIMIT }, (_, index) => {
      return db
        .prepare(
          `INSERT INTO leads (id, brand_id, source_id, status, counts_to_quota, received_at) VALUES (?, ?, ?, 'analyzed', 1, ?)`,
        )
        .bind(`quota-${brandId}-${index}`, brandId, source.id, at);
    });
    await db.batch(statements);
    const { analyzer, calls } = createMockAnalyzer();

    const lead = buildLeadInput({ email: "over-quota@northwind.example" });

    const result = await admit({ brandId, sourceId: source.id, now, lead });
    await runDueJobs({ db, analyzer, now });

    expect(result.status).toBe("over_quota");
    expect(calls.map((call) => call.lead.email)).not.toContain(lead.email);
    expect((await getLead({ db, brandId, leadId: result.leadId }))?.status).toBe("over_quota");
  });

  it("F4: spam filtered by rules does not count towards the monthly quota", async () => {
    const { accountId, brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });

    await admit({
      brandId,
      sourceId: source.id,
      lead: buildLeadInput({ message: "We sell backlinks and guest post packages." }),
    });

    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM leads l JOIN brands b ON b.id = l.brand_id WHERE b.account_id = ? AND counts_to_quota = 1",
        binds: [accountId],
      }),
    ).toBe(0);
  });

  it("F4: an unparseable message is parse_failed and keeps the raw body", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "email" });

    const result = await admitLead({
      db,
      brandId,
      sourceId: source.id,
      dedupeKey: null,
      parsed: { ok: false, error: "Message has no readable body" },
      raw: "Subject: broken\r\n\r\n",
      authResults: null,
      now: new Date(),
    });

    const lead = await getLead({ db, brandId, leadId: result.leadId });
    expect(lead?.status).toBe("parse_failed");
    expect(lead?.raw).toBe("Subject: broken\r\n\r\n");
  });

  it("F4: a lead stuck in analyzing for 5 minutes goes back to the queue", async () => {
    const { brandId } = await seedAccount();
    const source = await seedSource({ brandId, kind: "webhook" });
    const start = new Date("2026-11-20T10:00:00.000Z");
    const { leadId } = await admit({ brandId, sourceId: source.id, now: start });
    await db
      .prepare(`UPDATE leads SET status = 'analyzing', next_attempt_at = ? WHERE id = ?`)
      .bind(start.toISOString(), leadId)
      .run();
    const { analyzer } = createMockAnalyzer();

    await runDueJobs({ db, analyzer, now: new Date(start.getTime() + 6 * 60_000) });

    expect((await getLead({ db, brandId, leadId }))?.status).toBe("analyzed");
  });
});
