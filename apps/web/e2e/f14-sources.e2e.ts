import type { Browser, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSource,
  createTrialAccount,
  launchBrowser,
  MOBILE,
  openSession,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

const FORWARD_EMAIL = "Forward email";
const WEBHOOK = "Webhook";

describe("Adding sources shows what happened, and the plan limit up front", () => {
  let browser: Browser;
  let trial: Session;
  let free: Session;

  beforeAll(async () => {
    browser = await launchBrowser();
    trial = await openSession({ browser, viewport: MOBILE });
    const trialEmail = uniqueEmail("f14-trial");
    const { brandId } = await createTrialAccount({ email: trialEmail });
    await signInWithUi({ page: trial.page, email: trialEmail });
    await createSource({ page: trial.page, brandId, kind: "email" });

    free = await openSession({ browser, viewport: MOBILE });
    await signInWithUi({ page: free.page, email: uniqueEmail("f14-free") });
    await free.page.getByRole("heading", { name: "What's the business called?" }).waitFor();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("Sources: the paid plan says sources are unlimited", async () => {
    const { page } = trial;
    await page.goto("/app/sources");
    await page.getByText("1 source connected, no limit on your plan.").waitFor();

    expect(await addButton(page, WEBHOOK).isEnabled()).toBe(true);
  });

  it("Sources: a tap on Webhook confirms it and brings the new card into view on a phone", async () => {
    const { page } = trial;
    await addButton(page, WEBHOOK).click();
    await page.getByRole("status").filter({ hasText: "Webhook added" }).waitFor();
    const card = page.locator("[data-source-kind=webhook]");
    await card.waitFor();
    await page.waitForTimeout(800);

    expect(await isInViewport(page, card)).toBe(true);
  });

  it("Sources: two cards with a long webhook URL still fit the phone width", async () => {
    const { page } = trial;
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    const card = await page.locator("[data-source-kind=webhook] section").boundingBox();

    expect(overflow).toBeLessThanOrEqual(0);
    expect((card?.x ?? 0) + (card?.width ?? Infinity)).toBeLessThanOrEqual(MOBILE.width);
  });

  it("Sources: on the paid plan a third source can still be added", async () => {
    const { page } = trial;
    await page.getByText("2 sources connected, no limit on your plan.").waitFor();
    await addButton(page, FORWARD_EMAIL).click();
    await page.getByText("3 sources connected, no limit on your plan.").waitFor();

    expect(await addButton(page, WEBHOOK).isEnabled()).toBe(true);
    expect(await addButton(page, FORWARD_EMAIL).isEnabled()).toBe(true);
    expect(await page.getByText("no room for another source").count()).toBe(0);
  });

  it("Sources: on Free at the limit the page links to the paid plan", async () => {
    const { page } = free;
    await page.goto("/app/sources");
    await page.getByRole("heading", { name: "Sources" }).waitFor();
    if (await addButton(page, FORWARD_EMAIL).isEnabled()) {
      await addButton(page, FORWARD_EMAIL).click();
    }
    await page.getByText("1 of 1 sources used").waitFor();
    const upgrade = page.getByRole("link", { name: "Get unlimited sources" });

    expect(await upgrade.getAttribute("href")).toBe("/app/billing");
    expect(await addButton(page, WEBHOOK).isDisabled()).toBe(true);
  });

  it("Sources: no console errors along the way", () => {
    expect([...trial.consoleErrors, ...free.consoleErrors]).toEqual([]);
  });
});

function addButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function isInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) {
    return false;
  }
  return box.y >= 0 && box.y < viewport.height - 40;
}
