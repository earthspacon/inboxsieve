import { SPAM_CHECKER_PAGE_PATH } from "@inboxsieve/contract";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { launchBrowser, openSession } from "./helpers";

describe("F13 free spam checker", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F13: a visitor pastes a message without signing in and gets a label, a score and the reasons", async () => {
    const { page, consoleErrors } = await openSession({ browser });
    await page.goto(SPAM_CHECKER_PAGE_PATH);
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.getByRole("button", { name: "Check this message" }).and(page.locator(":not([disabled])")).click();

    await page.getByText("/100").waitFor();
    expect(await page.getByText("Real request", { exact: true }).count()).toBe(1);
    expect(await page.locator("li").count()).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  it("F13: link spam is labelled Spam", async () => {
    const { page } = await openSession({ browser });
    await page.goto(SPAM_CHECKER_PAGE_PATH);
    await page
      .getByLabel("The message")
      .fill(
        "Dear sir, we sell high quality backlinks for your website. Click here to buy now: http://cheap-seo.example",
      );
    await page.getByRole("button", { name: "Check this message" }).and(page.locator(":not([disabled])")).click();

    await page.getByText("/100").waitFor();
    expect(await page.getByText("Spam", { exact: true }).count()).toBe(1);
  });
});
