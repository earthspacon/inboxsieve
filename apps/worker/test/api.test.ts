import type { LeadDetailDto, LeadSummaryDto, SourceDto } from "@inboxsieve/contract";
import { describe, expect, it } from "vitest";

import { admitLead } from "../src/leads/pipeline";
import { runDueJobs } from "../src/leads/jobs";
import { createApiClient } from "./api-client";
import {
  buildLeadInput,
  buildTestDeps,
  countRows,
  createMockAnalyzer,
  db,
  uniqueEmail,
  VALID_ANALYSIS,
} from "./helpers";
import { BASE, signInTrial } from "./session";

async function setUp({ plan = "solo" }: { plan?: "solo" | "agency" } = {}) {
  const session = await signInTrial({ email: uniqueEmail("api"), plan });
  const mock = createMockAnalyzer((request) => {
    if (request.lead.subject === "Cold one") {
      return { ...VALID_ANALYSIS, score: 30, category: "cold" };
    }
    return VALID_ANALYSIS;
  });
  const { deps, scheduled } = buildTestDeps({ analyzer: mock.analyzer });
  const api = createApiClient({ deps, cookie: session.cookie });
  return {
    ...session,
    ...mock,
    deps,
    scheduled,
    api,
  };
}

async function createSource({
  api,
  brandId,
  kind,
}: {
  api: ReturnType<typeof createApiClient>;
  brandId: string;
  kind: string;
}) {
  const response = await api(`/api/brands/${brandId}/sources`, { method: "POST", body: { kind, name: "" } });
  return { response, source: await response.json<SourceDto>() };
}

async function seedLeads(context: Awaited<ReturnType<typeof setUp>>) {
  const { source } = await createSource({ api: context.api, brandId: context.brandId, kind: "webhook" });
  const inputs = [
    buildLeadInput({ subject: "Hot one", email: "hot@client.example" }),
    buildLeadInput({ subject: "Cold one", email: "cold@client.example" }),
    buildLeadInput({ subject: "Spam one", email: "spam@client.example", message: "Cheap backlinks for your site" }),
  ];
  const ids: string[] = [];
  for (const lead of inputs) {
    const result = await admitLead({
      db,
      brandId: context.brandId,
      sourceId: source.id,
      dedupeKey: null,
      parsed: { ok: true, lead },
      raw: `raw ${lead.subject}`,
      authResults: null,
      now: new Date(),
    });
    ids.push(result.leadId);
  }
  await runDueJobs({ db, analyzer: context.analyzer, now: new Date() });
  return {
    hotId: ids[0],
    coldId: ids[1],
    spamId: ids[2],
  };
}

describe("API: leads", () => {
  it("lists leads newest first and filters by score, stage, category and search", async () => {
    const context = await setUp();
    await seedLeads(context);
    const list = (path: string) =>
      context.api(`/api/brands/${context.brandId}/leads${path}`).then((response) => response.json<LeadSummaryDto[]>());

    expect((await list("")).map((lead) => lead.subject).sort()).toEqual(["Cold one", "Hot one", "Spam one"]);
    expect((await list("?scoreMin=70")).map((lead) => lead.subject)).toEqual(["Hot one"]);
    expect((await list("?stage=spam")).map((lead) => lead.subject)).toEqual(["Spam one"]);
    expect((await list("?category=cold")).map((lead) => lead.subject)).toEqual(["Cold one"]);
    expect((await list("?q=cold%40client")).map((lead) => lead.subject)).toEqual(["Cold one"]);
    expect(await list("?q=nothing-matches")).toEqual([]);
  });

  it("returns the lead detail with analysis, draft and the status history", async () => {
    const context = await setUp();
    const { hotId } = await seedLeads(context);

    const lead = await context
      .api(`/api/brands/${context.brandId}/leads/${hotId}`)
      .then((response) => response.json<LeadDetailDto>());

    expect(lead.analysis).toEqual(VALID_ANALYSIS);
    expect(lead.draft).toBe(VALID_ANALYSIS.draftReply);
    expect(lead.hasOriginal).toBe(true);
    expect(lead.events.filter((event) => event.type === "status").map((event) => event.to)).toEqual([
      "received",
      "parsed",
      "queued",
      "analyzing",
      "analyzed",
    ]);
  });

  it("serves the original message as plain text", async () => {
    const context = await setUp();
    const { hotId } = await seedLeads(context);

    const response = await context.api(`/api/brands/${context.brandId}/leads/${hotId}/original`);

    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await response.text()).toBe("raw Hot one");
  });

  it("edits the draft, marks replied and moves a new lead to contacted", async () => {
    const context = await setUp();
    const { hotId } = await seedLeads(context);
    const path = `/api/brands/${context.brandId}/leads/${hotId}`;

    await context.api(`${path}/draft`, { method: "PUT", body: { draft: "Edited reply" } });
    const replied = await context
      .api(`${path}/replied`, { method: "POST" })
      .then((response) => response.json<LeadDetailDto>());

    expect(replied.draft).toBe("Edited reply");
    expect(replied.stage).toBe("contacted");
    expect(replied.repliedAt).not.toBeNull();
  });

  it("moves the stage along the pipeline and refuses an illegal jump with 409", async () => {
    const context = await setUp();
    const { hotId } = await seedLeads(context);
    const path = `/api/brands/${context.brandId}/leads/${hotId}/stage`;

    const toMeeting = await context.api(path, { method: "PATCH", body: { stage: "meeting" } });
    const toWon = await context.api(path, { method: "PATCH", body: { stage: "won" } });
    const backToNew = await context.api(path, { method: "PATCH", body: { stage: "new" } });
    const unknown = await context.api(path, { method: "PATCH", body: { stage: "qualified" } });

    expect(toMeeting.status).toBe(200);
    expect((await toWon.json<LeadDetailDto>()).stage).toBe("won");
    expect(backToNew.status).toBe(409);
    expect(unknown.status).toBe(400);
  });

  it('"Not spam" moves a rule-filtered lead to new, stores feedback and sends it to analysis', async () => {
    const context = await setUp();
    const { spamId } = await seedLeads(context);

    const response = await context.api(`/api/brands/${context.brandId}/leads/${spamId}/not-spam`, { method: "POST" });
    await Promise.all(context.scheduled);

    const lead = await context
      .api(`/api/brands/${context.brandId}/leads/${spamId}`)
      .then((result) => result.json<LeadDetailDto>());
    expect(response.status).toBe(200);
    expect(lead.stage).toBe("new");
    expect(lead.status).toBe("analyzed");
    expect(
      await countRows({
        sql: `SELECT COUNT(*) AS n FROM feedback WHERE lead_id = ? AND kind = 'not_spam'`,
        binds: [spamId],
      }),
    ).toBe(1);
  });

  it('"Not spam" on a lead that is not spam answers 409', async () => {
    const context = await setUp();
    const { hotId } = await seedLeads(context);

    const response = await context.api(`/api/brands/${context.brandId}/leads/${hotId}/not-spam`, { method: "POST" });

    expect(response.status).toBe(409);
  });

  it('stores "wrong score" feedback and rejects a score outside 0–100', async () => {
    const context = await setUp();
    const { coldId } = await seedLeads(context);
    const path = `/api/brands/${context.brandId}/leads/${coldId}/feedback`;

    const ok = await context.api(path, { method: "POST", body: { expectedScore: 80, note: "They are a fit" } });
    const bad = await context.api(path, { method: "POST", body: { expectedScore: 120 } });

    expect(ok.status).toBe(201);
    expect(bad.status).toBe(400);
    expect(
      await countRows({
        sql: `SELECT COUNT(*) AS n FROM feedback WHERE lead_id = ? AND expected_score = 80`,
        binds: [coldId],
      }),
    ).toBe(1);
  });

  it("retries a failed analysis and refuses to retry an analyzed lead", async () => {
    const context = await setUp();
    const { hotId, coldId } = await seedLeads(context);
    await db.prepare(`UPDATE leads SET status = 'analysis_failed', attempts = 3 WHERE id = ?`).bind(coldId).run();

    const retried = await context.api(`/api/brands/${context.brandId}/leads/${coldId}/retry`, { method: "POST" });
    const refused = await context.api(`/api/brands/${context.brandId}/leads/${hotId}/retry`, { method: "POST" });

    expect(retried.status).toBe(202);
    expect((await retried.json<LeadDetailDto>()).status).toBe("queued");
    expect(refused.status).toBe(409);
  });

  it("another account's brand answers 404", async () => {
    const owner = await setUp();
    const stranger = await setUp();
    const { hotId } = await seedLeads(owner);

    const list = await stranger.api(`/api/brands/${owner.brandId}/leads`);
    const detail = await stranger.api(`/api/brands/${owner.brandId}/leads/${hotId}`);
    const ownBrandOtherLead = await stranger.api(`/api/brands/${stranger.brandId}/leads/${hotId}`);

    expect(list.status).toBe(404);
    expect(detail.status).toBe(404);
    expect(ownBrandOtherLead.status).toBe(404);
  });
});

describe("API: sources", () => {
  it("creates an email source with a forwarding address and a webhook source with a URL", async () => {
    const { api, brandId } = await setUp({ plan: "agency" });

    const email = await createSource({ api, brandId, kind: "email" });
    const webhook = await createSource({ api, brandId, kind: "webhook" });

    expect(email.response.status).toBe(201);
    expect(email.source.state).toBe("awaiting_first_message");
    expect(email.source.address).toMatch(/^my-brand-[a-f0-9]{10}@in\.inboxsieve\.example$/);
    expect(webhook.source.webhookUrl).toMatch(new RegExp(`^${BASE}/h/[a-f0-9]{32}$`));
  });

  it("disables and re-enables a source, and a disabled webhook answers 410", async () => {
    const { api, brandId, deps } = await setUp();
    const { source } = await createSource({ api, brandId, kind: "webhook" });
    const path = `/api/brands/${brandId}/sources/${source.id}`;

    const disabled = await api(path, { method: "PATCH", body: { enabled: false } }).then((response) =>
      response.json<SourceDto>(),
    );
    const hook = await createApiClient({ deps, cookie: "" })(new URL(source.webhookUrl ?? "").pathname, {
      method: "POST",
      body: { email: "a@b.example" },
    });
    const enabled = await api(path, { method: "PATCH", body: { enabled: true, name: "Contact page" } }).then(
      (response) => response.json<SourceDto>(),
    );

    expect(disabled.state).toBe("disabled");
    expect(hook.status).toBe(410);
    expect(enabled.state).toBe("awaiting_first_message");
    expect(enabled.name).toBe("Contact page");
  });

  it("rotating the token retires the old webhook URL", async () => {
    const { api, brandId, deps } = await setUp();
    const { source } = await createSource({ api, brandId, kind: "webhook" });

    const rotated = await api(`/api/brands/${brandId}/sources/${source.id}/rotate-token`, { method: "POST" }).then(
      (response) => response.json<SourceDto>(),
    );
    const anonymous = createApiClient({ deps, cookie: "" });
    const oldHook = await anonymous(new URL(source.webhookUrl ?? "").pathname, {
      method: "POST",
      body: { email: "a@b.example" },
    });
    const newHook = await anonymous(new URL(rotated.webhookUrl ?? "").pathname, {
      method: "POST",
      body: { email: "a@b.example" },
    });

    expect(rotated.webhookUrl).not.toBe(source.webhookUrl);
    expect(oldHook.status).toBe(404);
    expect(newHook.status).toBe(202);
  });

  it("lists and deletes sources", async () => {
    const { api, brandId } = await setUp();
    const { source } = await createSource({ api, brandId, kind: "email" });

    const deleted = await api(`/api/brands/${brandId}/sources/${source.id}`, { method: "DELETE" });
    const list = await api(`/api/brands/${brandId}/sources`).then((response) => response.json<SourceDto[]>());

    expect(deleted.status).toBe(204);
    expect(list).toEqual([]);
  });

  it("Solo stops at 2 sources with plan_limit", async () => {
    const { api, brandId } = await setUp();

    await createSource({ api, brandId, kind: "email" });
    await createSource({ api, brandId, kind: "webhook" });
    const third = await createSource({ api, brandId, kind: "webhook" });

    expect(third.response.status).toBe(403);
  });
});

describe("API: account, brands, usage and access", () => {
  it("Solo cannot add a second brand, Agency can", async () => {
    const solo = await setUp();
    const agency = await setUp({ plan: "agency" });

    const soloBrand = await solo.api("/api/brands", { method: "POST", body: { name: "Client B" } });
    const agencyBrand = await agency.api("/api/brands", { method: "POST", body: { name: "Client B" } });

    expect(soloBrand.status).toBe(403);
    expect(agencyBrand.status).toBe(201);
  });

  it("renames a brand during onboarding and rejects an empty name", async () => {
    const context = await setUp();

    const renamed = await context.api(`/api/brands/${context.brandId}`, { method: "PATCH", body: { name: "Acme" } });
    const empty = await context.api(`/api/brands/${context.brandId}`, { method: "PATCH", body: { name: " " } });

    expect(await renamed.json()).toMatchObject({ id: context.brandId, name: "Acme" });
    expect(empty.status).toBe(400);
  });

  it('"Send a test lead" needs a source, then injects one lead that goes to analysis', async () => {
    const context = await setUp();

    const withoutSource = await context.api(`/api/brands/${context.brandId}/test-lead`, { method: "POST" });
    await createSource({ api: context.api, brandId: context.brandId, kind: "email" });
    const created = await context.api(`/api/brands/${context.brandId}/test-lead`, { method: "POST" });
    await Promise.all(context.scheduled);

    expect(withoutSource.status).toBe(409);
    expect(created.status).toBe(201);
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM leads WHERE brand_id = ? AND status = 'analyzed'",
        binds: [context.brandId],
      }),
    ).toBe(1);
  });

  it("usage counts analyzed-path leads against the plan limit", async () => {
    const context = await setUp();
    await seedLeads(context);

    const usage = await context.api(`/api/brands/${context.brandId}/usage`).then((response) => response.json());

    expect(usage).toMatchObject({ used: 2, limit: 500 });
  });

  it("an expired account can read but not write", async () => {
    const context = await setUp();
    await db.prepare(`UPDATE subscriptions SET status = 'expired' WHERE account_id = ?`).bind(context.accountId).run();

    const read = await context.api(`/api/brands/${context.brandId}/leads`);
    const write = await context.api(`/api/brands/${context.brandId}/sources`, {
      method: "POST",
      body: { kind: "email", name: "" },
    });

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
  });

  it("dev routes are off unless DEV_ROUTES is 1", async () => {
    const { deps } = await setUp();
    const prodDeps = { ...deps, env: { ...deps.env, DEV_ROUTES: "0" } };

    const response = await createApiClient({ deps: prodDeps, cookie: "" })("/dev/accounts", {
      method: "POST",
      body: { email: "x@y.example" },
    });

    expect(response.status).toBe(404);
  });
});
