import { describe, expect, it } from "vitest";

import { runMaintenance } from "../src/maintenance";
import { createApiClient } from "./api-client";
import { buildTestDeps, createMockAnalyzer, db, seedAccount, uniqueEmail } from "./helpers";
import { sendFixture } from "./paddle";
import { signIn } from "./session";

const DAY_MS = 24 * 60 * 60 * 1000;

async function setUp() {
  const email = uniqueEmail("f7");
  const account = await seedAccount({ email, status: "no_subscription" });
  const periodEnd = new Date(Date.now() + 10 * DAY_MS).toISOString();
  await sendFixture({ fixture: "activated", options: { accountId: account.accountId, periodEnd } });
  const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
  const api = createApiClient({ deps, cookie: await signIn(email) });
  return {
    ...account,
    deps,
    api,
    periodEnd,
  };
}

describe("F7 billing: plan changes", () => {
  it("F7: upgrading Solo → Agency unlocks the 2nd brand at once", async () => {
    const context = await setUp();
    const before = await context.api("/api/brands", { method: "POST", body: { name: "Client B" } });

    await sendFixture({
      fixture: "upgrade",
      options: { accountId: context.accountId, periodEnd: context.periodEnd, occurredAt: new Date(Date.now() + 1000) },
    });
    const after = await context.api("/api/brands", { method: "POST", body: { name: "Client B" } });

    expect(before.status).toBe(403);
    expect(await before.json()).toMatchObject({ error: "plan_limit" });
    expect(after.status).toBe(201);
  });

  it("F7: a downgrade keeps Agency until current_period_end, then extra brands turn read-only", async () => {
    const context = await setUp();
    await sendFixture({
      fixture: "upgrade",
      options: { accountId: context.accountId, periodEnd: context.periodEnd, occurredAt: new Date(Date.now() + 1000) },
    });
    const second = await (
      await context.api("/api/brands", { method: "POST", body: { name: "Client B" } })
    ).json<{ id: string }>();

    await sendFixture({
      fixture: "downgrade",
      options: { accountId: context.accountId, periodEnd: context.periodEnd, occurredAt: new Date(Date.now() + 2000) },
    });
    const duringPeriod = await context.api(`/api/brands/${second.id}`, {
      method: "PATCH",
      body: { name: "Client B2" },
    });
    await runMaintenance({ deps: context.deps, now: new Date(Date.parse(context.periodEnd) + 60_000) });
    const plan = await db
      .prepare("SELECT plan FROM accounts WHERE id = ?")
      .bind(context.accountId)
      .first<{ plan: string }>();
    const blockedWrite = await context.api(`/api/brands/${second.id}`, {
      method: "PATCH",
      body: { name: "Client B3" },
    });
    const read = await context.api(`/api/brands/${second.id}/leads`);
    const firstBrandWrite = await context.api(`/api/brands/${context.brandId}`, {
      method: "PATCH",
      body: { name: "Main" },
    });
    const brands = await (await context.api("/api/brands")).json<Array<{ id: string; readOnly: boolean }>>();

    expect(duringPeriod.status).toBe(200);
    expect(plan?.plan).toBe("solo");
    expect(blockedWrite.status).toBe(403);
    expect(await blockedWrite.json()).toMatchObject({ error: "read_only" });
    expect(read.status).toBe(200);
    expect(firstBrandWrite.status).toBe(200);
    expect(
      brands.map((brand) => {
        return [brand.id, brand.readOnly];
      }),
    ).toEqual([
      [context.brandId, false],
      [second.id, true],
    ]);
  });
});
