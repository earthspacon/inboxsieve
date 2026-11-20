import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiJson,
  launchBrowser,
  openSession,
  runMaintenanceAt,
  sendPaddleFixture,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("F7 billing", () => {
  let browser: Browser;
  let session: Session;
  let accountId = "";
  const periodEnd = new Date(Date.now() + 10 * DAY_MS).toISOString();
  let clock = Date.now();

  function nextEventTime() {
    clock += 1000;
    return new Date(clock);
  }

  beforeAll(async () => {
    browser = await launchBrowser();
    session = await openSession({ browser });
    const email = uniqueEmail("f7");
    await signInWithUi({ page: session.page, email });
    await session.page.getByRole("heading", { name: "What's the business called?" }).waitFor();
    accountId = (await apiJson<{ account: { id: string } }>({ page: session.page, path: "/api/me" })).body.account.id;
    await sendPaddleFixture({ fixture: "subscription.activated", accountId, periodEnd, occurredAt: nextEventTime() });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F7: on Solo a second brand is blocked with an upgrade prompt", async () => {
    const { page } = session;
    await page.goto("/app/brands");
    await page.getByLabel("New brand").fill("Client B");
    await page.getByRole("button", { name: "Add brand" }).click();
    await page.getByText(/Your plan has no room for another brand/).waitFor();

    expect(await page.getByRole("link", { name: "Upgrade" }).first().isVisible()).toBe(true);
  });

  it("F7: the upgrade to Agency unlocks the 2nd brand", async () => {
    const { page } = session;
    const result = await sendPaddleFixture({
      fixture: "subscription.updated-upgrade",
      accountId,
      periodEnd,
      occurredAt: nextEventTime(),
    });
    await page.reload();
    await page.getByLabel("New brand").fill("Client B");
    await page.getByRole("button", { name: "Add brand" }).click();
    await page.locator("main").getByText("Client B").waitFor();

    expect(result.body.outcome).toBe("applied");
    expect((await apiJson<unknown[]>({ page, path: "/api/brands" })).body).toHaveLength(2);
  });

  it("F7: a downgrade makes the extra brand read-only at current_period_end", async () => {
    const { page } = session;
    await sendPaddleFixture({
      fixture: "subscription.updated-downgrade",
      accountId,
      periodEnd,
      occurredAt: nextEventTime(),
    });
    await page.goto("/app/billing");
    await page.getByText(/You move to Solo on/).waitFor();
    await page.goto("/app/brands");
    const beforeEnd = await page.getByText("Read-only on your plan").count();

    await runMaintenanceAt(new Date(Date.parse(periodEnd) + 60_000));
    await page.reload();
    await page.getByText("Read-only on your plan").waitFor();
    const brands = (
      await apiJson<Array<{ id: string; name: string; readOnly: boolean }>>({ page, path: "/api/brands" })
    ).body;
    const extra = brands.find((brand) => brand.name === "Client B");
    const write = await apiJson({
      page,
      path: `/api/brands/${extra?.id}`,
      method: "PATCH",
      body: { name: "Client C" },
    });

    expect(beforeEnd).toBe(0);
    expect(brands.map((brand) => brand.readOnly)).toEqual([false, true]);
    expect(write.status).toBe(403);
  });

  it("F7: Manage billing is offered to the owner", async () => {
    const { page } = session;
    await page.goto("/app/billing");

    expect(await page.getByRole("button", { name: "Manage billing" }).isEnabled()).toBe(true);
  });
});
