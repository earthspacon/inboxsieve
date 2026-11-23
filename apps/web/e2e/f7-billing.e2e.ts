import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiJson,
  launchBrowser,
  openSession,
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

  it("F7: on the paid plan a second brand is blocked with a write-to-us prompt", async () => {
    const { page } = session;
    await page.goto("/app/brands");
    await page.getByLabel("New brand").fill("Client B");
    await page.getByRole("button", { name: "Add brand" }).click();
    await page.getByText(/Your plan has no room for another brand/).waitFor();

    expect(await page.getByRole("link", { name: "Write to us" }).first().isVisible()).toBe(true);
  });

  it("F7: Manage billing is offered to the owner", async () => {
    const { page } = session;
    await page.goto("/app/billing");

    expect(await page.getByRole("button", { name: "Manage billing" }).isEnabled()).toBe(true);
  });
});
