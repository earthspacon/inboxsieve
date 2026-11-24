import { mkdirSync } from "node:fs";
import path from "node:path";

import { SPAM_CHECKER_PAGE_PATH } from "@inboxsieve/contract";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SHOTS_DIR as BASE_SHOTS_DIR } from "./config";
import { DESKTOP, launchBrowser, MOBILE, openSession } from "./helpers";

// Run with `SHOTS=1 vitest run --config vitest.e2e.config.ts spam-checker`.
const SHOTS_DIR = process.env.SPAM_CHECKER_SHOTS_DIR ?? path.join(BASE_SHOTS_DIR, "spam-checker");

describe("free spam checker screenshots", () => {
  let browser: Browser;

  beforeAll(async () => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  it.each([
    { label: "1440", size: DESKTOP },
    { label: "390", size: MOBILE },
  ])("spam checker with a result ($label)", async ({ label, size }) => {
    const { page, consoleErrors } = await openSession({ browser, viewport: size });
    await page.goto(SPAM_CHECKER_PAGE_PATH);
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.getByLabel(/Who are your ideal clients/).fill("Dental clinics and law firms with a $5k+ budget");
    await page.getByRole("button", { name: "Check this message" }).and(page.locator(":not([disabled])")).click();
    await page.getByText("/100").waitFor();
    await page.screenshot({ path: path.join(BASE_SHOTS_DIR, `spam-checker-${label}.png`), fullPage: true });

    expect(consoleErrors).toEqual([]);
  });
});
