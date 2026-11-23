import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_URL } from "./config";
import {
  apiJson,
  launchBrowser,
  openSession,
  runMaintenanceAt,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_BUTTON = "Try it free for 14 days";

describe("Free plan and the no-card trial", () => {
  let browser: Browser;
  let session: Session;
  const email = uniqueEmail("trial");

  beforeAll(async () => {
    browser = await launchBrowser();
    session = await openSession({ browser });
    await signInWithUi({ page: session.page, email });
    await session.page.getByRole("heading", { name: "What's the business called?" }).waitFor();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("Trial: billing on Free offers the trial and the upgrade, with no card asked", async () => {
    const { page } = session;
    await page.goto("/app/billing");
    await page.getByRole("heading", { name: "You're on the Free plan" }).waitFor();

    expect(await page.getByRole("button", { name: TRIAL_BUTTON }).isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Upgrade for $4 / month" }).isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Manage billing" }).count()).toBe(0);
  });

  it("Trial: one click starts the paid plan for 14 days and the trial button goes away", async () => {
    const { page } = session;
    await page.getByRole("button", { name: TRIAL_BUTTON }).click();
    await page.getByRole("heading", { name: "You're on the $4 / month · cancel anytime plan" }).waitFor();
    const billing = await apiJson<{ subscription: string; trialEndsAt: string }>({ page, path: "/api/billing" });

    expect(await page.getByText(/Your free trial ends on/).isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: TRIAL_BUTTON }).count()).toBe(0);
    expect(billing.body.subscription).toBe("trialing");
    expect(Date.parse(billing.body.trialEndsAt) - Date.now()).toBeGreaterThan(13 * DAY_MS);
  });

  it("Trial: after 14 days the workspace is back on Free and the owner gets one email", async () => {
    const { page } = session;
    await runMaintenanceAt(new Date(Date.now() + 15 * DAY_MS));
    await runMaintenanceAt(new Date(Date.now() + 16 * DAY_MS));
    await page.reload();
    await page.getByRole("heading", { name: "You're on the Free plan" }).waitFor();
    const outbox = (await (await fetch(`${E2E_URL}/dev/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{
      subject: string;
    }>;

    expect(await page.getByRole("button", { name: TRIAL_BUTTON }).count()).toBe(0);
    expect(outbox.filter((mail) => mail.subject === "Your InboxSieve trial has ended")).toHaveLength(1);
  });

  it("Trial: no console errors along the way", () => {
    expect(session.consoleErrors).toEqual([]);
  });
});
