import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SHOTS_DIR } from "./config";
import { DESKTOP, launchBrowser, MOBILE, openSession } from "./helpers";
import { startWorker, type RunningWorker } from "./worker";

// Brief 11 shots only: run with `SHOTS=1 vitest run --config vitest.e2e.config.ts price-google`.
const GOOGLE_PORT = 8792;
const TURNSTILE_SETTLE_MS = 1000;

async function openSignIn(page: Page) {
  const options = page.waitForResponse((response) => response.url().endsWith("/api/sign-in-options"));
  await page.goto("/sign-in");
  await options;
  await page.locator("button[type=submit]:not([disabled])").waitFor();
  await page.waitForTimeout(TURNSTILE_SETTLE_MS);
}

describe("brief 11 screenshots", () => {
  let browser: Browser;
  let googleWorker: RunningWorker;

  beforeAll(async () => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    browser = await launchBrowser();
    googleWorker = await startWorker({
      port: GOOGLE_PORT,
      vars: {
        GOOGLE_CLIENT_ID: "shots-client-id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "shots-client-secret",
      },
    });
  });

  afterAll(async () => {
    await browser.close();
    googleWorker.stop();
  });

  it.each([
    { label: "desktop", size: DESKTOP },
    { label: "mobile", size: MOBILE },
  ])("pricing ($label)", async ({ label, size }) => {
    const { page, consoleErrors } = await openSession({ browser, viewport: size });
    await page.goto("/pricing");
    await page.getByText("$4 / month").first().waitFor();
    await page.screenshot({ path: path.join(SHOTS_DIR, `pricing-${label}.png`), fullPage: true });

    expect(consoleErrors).toEqual([]);
  });

  it("sign-in on mobile without Google", async () => {
    const { page, consoleErrors } = await openSession({ browser, viewport: MOBILE });
    await openSignIn(page);
    await page.screenshot({ path: path.join(SHOTS_DIR, "sign-in-mobile.png"), fullPage: true });

    expect(await page.getByRole("button", { name: "Continue with Google" }).count()).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  it("sign-in on mobile with Google", async () => {
    const { page, consoleErrors } = await openSession({ browser, viewport: MOBILE, baseURL: googleWorker.url });
    await openSignIn(page);
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    await page.screenshot({ path: path.join(SHOTS_DIR, "sign-in-google-mobile.png"), fullPage: true });

    expect(consoleErrors).toEqual([]);
  });
});
