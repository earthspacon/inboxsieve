import { PLAN_LIMITS, TRIAL_DAYS, type BillingDto, type BrandDto, type MeDto } from "@inboxsieve/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queueHotLeadAlerts } from "../src/alerts/alerts";
import { runDueJobs } from "../src/leads/jobs";
import { admitLead } from "../src/leads/pipeline";
import { runMaintenance } from "../src/maintenance";
import { getLead, saveAlertSettings } from "../src/repo";
import { createApiClient } from "./api-client";
import {
  buildLeadInput,
  buildTestDeps,
  countRows,
  createMockAnalyzer,
  db,
  seedAccount,
  seedSource,
  uniqueEmail,
} from "./helpers";
import { sendFixture } from "./paddle";
import { signIn } from "./session";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLACK_URL = "https://hooks.slack.com/services/T000/B000/example";

async function signInFree(prefix: string) {
  const email = uniqueEmail(prefix);
  const cookie = await signIn(email);
  const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
  const api = createApiClient({ deps, cookie });
  const me = await (await api("/api/me")).json<MeDto>();
  return {
    email,
    api,
    deps,
    accountId: me.account.id,
    brandId: me.brands[0].id,
  };
}

function countTrialEndedMails(email: string) {
  return countRows({
    sql: "SELECT COUNT(*) AS n FROM dev_outbox WHERE to_address = ? AND subject LIKE '%trial has ended%'",
    binds: [email],
  });
}

describe("Free plan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Free: a new email signs in onto Free with full access and no 402", async () => {
    const { api } = await signInFree("free-new");

    const me = await (await api("/api/me")).json<MeDto>();
    const brands = await api("/api/brands");
    const billing = await (await api("/api/billing")).json<BillingDto>();

    expect(me.account).toMatchObject({ plan: "free", subscription: "no_subscription", access: "full" });
    expect(brands.status).toBe(200);
    expect(billing).toMatchObject({ plan: "free", canStartTrial: true, trialEndsAt: null });
  });

  it("Free: a 2nd brand, a 2nd source and a 2nd seat are refused with plan_limit", async () => {
    const { api, brandId } = await signInFree("free-limits");
    const first = await api(`/api/brands/${brandId}/sources`, { method: "POST", body: { kind: "webhook", name: "" } });

    const brand = await api("/api/brands", { method: "POST", body: { name: "Client B" } });
    const source = await api(`/api/brands/${brandId}/sources`, { method: "POST", body: { kind: "email", name: "" } });
    const seat = await api("/api/seats", { method: "POST", body: { email: uniqueEmail("mate") } });

    expect(first.status).toBe(201);
    expect([brand.status, source.status, seat.status]).toEqual([403, 403, 403]);
    expect(await brand.json()).toMatchObject({ error: "plan_limit" });
    expect(await source.json()).toMatchObject({ error: "plan_limit" });
    expect(await seat.json()).toMatchObject({ error: "plan_limit" });
  });

  it("Free: leads are analyzed, and the 51st lead this month is stored as over_quota", async () => {
    const { api, brandId } = await signInFree("free-quota");
    const source = await seedSource({ brandId, kind: "webhook" });
    const now = new Date();
    const admit = (email: string) => {
      return admitLead({
        db,
        brandId,
        sourceId: source.id,
        dedupeKey: null,
        parsed: { ok: true, lead: buildLeadInput({ email }) },
        raw: "raw",
        authResults: null,
        now,
      });
    };
    const first = await admit("first@northwind.example");
    await runDueJobs({ db, analyzer: createMockAnalyzer().analyzer, now });
    await db.batch(
      Array.from({ length: PLAN_LIMITS.free.leadsPerMonth - 1 }, (_, index) => {
        return db
          .prepare(
            `INSERT INTO leads (id, brand_id, source_id, status, counts_to_quota, received_at) VALUES (?, ?, ?, 'analyzed', 1, ?)`,
          )
          .bind(`free-${brandId}-${index}`, brandId, source.id, now.toISOString());
      }),
    );

    const over = await admit("over@northwind.example");
    const usage = await (await api(`/api/brands/${brandId}/usage`)).json<{ used: number; limit: number }>();

    expect((await getLead({ db, brandId, leadId: first.leadId }))?.status).toBe("analyzed");
    expect(over.status).toBe("over_quota");
    expect(usage).toMatchObject({ used: 50, limit: 50 });
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM leads WHERE brand_id = ?", binds: [brandId] })).toBe(51);
  });

  it("Free: alerts go by email only, and saving a Slack webhook is refused with plan_limit", async () => {
    const { api, accountId, brandId } = await signInFree("free-slack");
    const source = await seedSource({ brandId, kind: "webhook" });
    await saveAlertSettings({ db, accountId, brandId, enabled: true, threshold: 0, slackWebhookUrl: SLACK_URL });
    const { leadId } = await admitLead({
      db,
      brandId,
      sourceId: source.id,
      dedupeKey: null,
      parsed: { ok: true, lead: buildLeadInput() },
      raw: "raw",
      authResults: null,
      now: new Date(),
    });
    await db.prepare("UPDATE leads SET score = 90 WHERE id = ?").bind(leadId).run();

    const saved = await api(`/api/brands/${brandId}/alerts`, {
      method: "PATCH",
      body: { enabled: true, threshold: 80, slackWebhookUrl: SLACK_URL },
    });
    const queued = await queueHotLeadAlerts({ db, brandId, leadId, now: new Date() });

    expect(saved.status).toBe(403);
    expect(await saved.json()).toMatchObject({ error: "plan_limit" });
    expect(queued).toBe(1);
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM alert_deliveries WHERE lead_id = ? AND channel = 'slack'",
        binds: [leadId],
      }),
    ).toBe(0);
  });
});

describe("Solo trial without a card", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Trial: starting it gives Solo for 14 days with no Paddle call", async () => {
    const { api, brandId } = await signInFree("trial-start");
    const network = vi.spyOn(globalThis, "fetch");
    const before = Date.now();

    const started = await api("/api/billing/trial", { method: "POST" });
    const billing = await started.json<BillingDto>();
    const me = await (await api("/api/me")).json<MeDto>();
    await api(`/api/brands/${brandId}/sources`, { method: "POST", body: { kind: "webhook", name: "" } });
    const secondSource = await api(`/api/brands/${brandId}/sources`, {
      method: "POST",
      body: { kind: "email", name: "" },
    });

    expect(started.status).toBe(200);
    expect(billing).toMatchObject({ plan: "solo", subscription: "trialing", canStartTrial: false });
    expect(Date.parse(billing.trialEndsAt ?? "") - before).toBeGreaterThanOrEqual(TRIAL_DAYS * DAY_MS - 60_000);
    expect(Date.parse(billing.trialEndsAt ?? "") - before).toBeLessThanOrEqual(TRIAL_DAYS * DAY_MS + 60_000);
    expect(me.account.plan).toBe("solo");
    expect(secondSource.status).toBe(201);
    expect(network).not.toHaveBeenCalled();
  });

  it("Trial: at the end the account goes back to Free and gets one email", async () => {
    const { api, deps, email, accountId } = await signInFree("trial-end");
    await api("/api/billing/trial", { method: "POST" });

    await runMaintenance({ deps, now: new Date(Date.now() + (TRIAL_DAYS - 1) * DAY_MS) });
    const during = await (await api("/api/me")).json<MeDto>();
    await runMaintenance({ deps, now: new Date(Date.now() + (TRIAL_DAYS + 1) * DAY_MS) });
    await runMaintenance({ deps, now: new Date(Date.now() + (TRIAL_DAYS + 2) * DAY_MS) });
    const after = await (await api("/api/me")).json<MeDto>();

    expect(during.account.plan).toBe("solo");
    expect(after.account).toMatchObject({
      id: accountId,
      plan: "free",
      subscription: "no_subscription",
      access: "full",
    });
    expect(await countTrialEndedMails(email)).toBe(1);
  });

  it("Trial: one per account, so a second start is refused with trial_used", async () => {
    const { api, deps } = await signInFree("trial-once");
    await api("/api/billing/trial", { method: "POST" });
    await runMaintenance({ deps, now: new Date(Date.now() + (TRIAL_DAYS + 1) * DAY_MS) });

    const again = await api("/api/billing/trial", { method: "POST" });
    const billing = await (await api("/api/billing")).json<BillingDto>();

    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "trial_used" });
    expect(billing).toMatchObject({ plan: "free", canStartTrial: false });
  });

  it("Trial: a paying account can't start it", async () => {
    const email = uniqueEmail("trial-paid");
    const { accountId } = await seedAccount({ email, status: "no_subscription" });
    await sendFixture({ fixture: "activated", options: { accountId } });
    const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
    const api = createApiClient({ deps, cookie: await signIn(email) });

    const response = await api("/api/billing/trial", { method: "POST" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already_paid" });
  });

  it("Trial: paying through Paddle during the trial keeps Solo after the trial date", async () => {
    const { api, deps, accountId } = await signInFree("trial-upgrade");
    await api("/api/billing/trial", { method: "POST" });
    const periodEnd = new Date(Date.now() + 40 * DAY_MS).toISOString();
    await sendFixture({ fixture: "activated", options: { accountId, periodEnd } });

    await runMaintenance({ deps, now: new Date(Date.now() + (TRIAL_DAYS + 1) * DAY_MS) });
    const me = await (await api("/api/me")).json<MeDto>();

    expect(me.account).toMatchObject({ plan: "solo", subscription: "active" });
  });
});

describe("Expired paid subscription", () => {
  it("Expired: after period end an Agency account falls back to Free, extra brands turn read-only", async () => {
    const email = uniqueEmail("expired");
    const { accountId, brandId } = await seedAccount({ email, plan: "agency", status: "no_subscription" });
    const periodEnd = new Date(Date.now() + DAY_MS).toISOString();
    await sendFixture({ fixture: "activated", options: { accountId, periodEnd } });
    await sendFixture({
      fixture: "upgrade",
      options: { accountId, periodEnd, occurredAt: new Date(Date.now() + 500) },
    });
    const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
    const api = createApiClient({ deps, cookie: await signIn(email) });
    const second = await (await api("/api/brands", { method: "POST", body: { name: "Client B" } })).json<BrandDto>();
    await sendFixture({ fixture: "canceled", options: { accountId, occurredAt: new Date(Date.now() + 1000) } });

    await runMaintenance({ deps, now: new Date(Date.now() + 2 * DAY_MS) });
    const me = await (await api("/api/me")).json<MeDto>();
    const renameFirst = await api(`/api/brands/${brandId}`, { method: "PATCH", body: { name: "Main" } });
    const renameSecond = await api(`/api/brands/${second.id}`, { method: "PATCH", body: { name: "Other" } });

    expect(me.account).toMatchObject({ plan: "free", subscription: "expired", access: "full" });
    expect(me.brands.find((brand) => brand.id === second.id)?.readOnly).toBe(true);
    expect(renameFirst.status).toBe(200);
    expect(renameSecond.status).toBe(403);
    expect(await renameSecond.json()).toMatchObject({ error: "read_only" });
  });
});
