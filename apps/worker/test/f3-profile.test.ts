import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE } from "../src/analysis/analyzer";
import { buildAnalysisPrompt } from "../src/analysis/prompt";
import { RESCORE_LIMIT } from "../src/leads/jobs";
import { createApiClient } from "./api-client";
import { buildLeadInput, buildTestDeps, countRows, createMockAnalyzer, db, uniqueEmail } from "./helpers";
import { signInTrial } from "./session";

const PROFILE = {
  services: "Webflow sites and marketing automation for B2B SaaS",
  idealClient: "Series A SaaS with a marketing team of 3+",
  minBudget: "$8k",
  tone: "Warm, short, no jargon",
  signature: "Jo, Acme Studio",
  bookingLink: "https://cal.acme-studio.example/intro",
};

async function setUp() {
  const session = await signInTrial({ email: uniqueEmail("profile") });
  const mock = createMockAnalyzer();
  const { deps, scheduled } = buildTestDeps({ analyzer: mock.analyzer });
  return {
    ...session,
    ...mock,
    deps,
    scheduled,
    api: createApiClient({ deps, cookie: session.cookie }),
  };
}

async function seedAnalyzedLeads({ brandId, count }: { brandId: string; count: number }) {
  const source = await db
    .prepare(
      `INSERT INTO sources (id, brand_id, kind, name, state, created_at, updated_at) VALUES (?, ?, 'webhook', 'S', 'connected', ?, ?) RETURNING id`,
    )
    .bind(crypto.randomUUID(), brandId, new Date().toISOString(), new Date().toISOString())
    .first<{ id: string }>();
  await db.batch(
    Array.from({ length: count }, (_, index) => {
      return db
        .prepare(
          `INSERT INTO leads (id, brand_id, source_id, status, received_at, message) VALUES (?, ?, ?, 'analyzed', ?, 'hello')`,
        )
        .bind(crypto.randomUUID(), brandId, source?.id, new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString());
    }),
  );
}

describe("F3 business profile", () => {
  it("F3: the built prompt caches the system prompt and business profile", () => {
    const prompt = buildAnalysisPrompt({
      lead: buildLeadInput(),
      profile: PROFILE,
      examples: [
        {
          kind: "not_spam",
          subject: "Partnership idea",
          message: "We resell your services to our clients.",
          expectedScore: null,
          note: "",
        },
        {
          kind: "wrong_score",
          subject: "Logo please",
          message: "Need a cheap logo.",
          expectedScore: 10,
          note: "we do not do logos",
        },
      ],
    });

    expect(prompt).toMatchSnapshot();
  });

  it("F3: a new brand starts with the default profile", async () => {
    const { api, brandId } = await setUp();

    const response = await api(`/api/brands/${brandId}/profile`);

    expect(await response.json()).toEqual({
      state: "defaults",
      profile: DEFAULT_PROFILE,
    });
  });

  it("F3: saving the profile changes the prompt the analyzer gets and offers a re-score", async () => {
    const { api, brandId, calls, scheduled } = await setUp();
    await seedAnalyzedLeads({ brandId, count: 1 });

    const saved = await api(`/api/brands/${brandId}/profile`, { method: "PUT", body: PROFILE });
    await api(`/api/brands/${brandId}/rescore`, { method: "POST" });
    await Promise.all(scheduled);

    const call = calls.find((item) => item.profile.services === PROFILE.services);
    expect(await saved.json()).toEqual({
      state: "saved",
      profile: PROFILE,
      rescoreOffered: true,
    });
    expect(call?.profile).toEqual(PROFILE);
    expect(buildAnalysisPrompt({ lead: buildLeadInput(), profile: PROFILE, examples: [] }).system[1].text).toContain(
      "Minimum budget: $8k",
    );
  });

  it("F3: a profile field that is not a string is rejected", async () => {
    const { api, brandId } = await setUp();

    const response = await api(`/api/brands/${brandId}/profile`, {
      method: "PUT",
      body: { ...PROFILE, minBudget: 8000 },
    });

    expect(response.status).toBe(400);
  });

  it('F3: "Re-score last 50" queues at most 50 jobs', async () => {
    const { api, brandId } = await setUp();
    await seedAnalyzedLeads({ brandId, count: RESCORE_LIMIT + 10 });

    const response = await api(`/api/brands/${brandId}/rescore`, { method: "POST" });

    expect(await response.json()).toEqual({ queued: RESCORE_LIMIT });
    expect(
      await countRows({
        sql: `SELECT COUNT(*) AS n FROM leads WHERE brand_id = ? AND status = 'queued'`,
        binds: [brandId],
      }),
    ).toBe(RESCORE_LIMIT);
  });
});
