import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_URL } from "./config";
import { createTrialAccount, launchBrowser, MOBILE, openSession, signInWithUi, uniqueEmail } from "./helpers";
import { startWorker, type RunningWorker } from "./worker";

const GOOGLE_PORT = 8791;
const GOOGLE_BUTTON = "Continue with Google";

async function openSignIn(page: Page) {
  const options = page.waitForResponse((response) => response.url().endsWith("/api/sign-in-options"));
  await page.goto("/sign-in");
  await options;
  await page.getByLabel("Work email").waitFor();
}

describe("F12 prices, Google sign-in, 404, invited teammate", () => {
  let browser: Browser;
  let googleWorker: RunningWorker;

  beforeAll(async () => {
    browser = await launchBrowser();
    googleWorker = await startWorker({
      port: GOOGLE_PORT,
      vars: {
        GOOGLE_CLIENT_ID: "e2e-client-id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "e2e-client-secret",
      },
    });
  });

  afterAll(async () => {
    await browser.close();
    googleWorker.stop();
  });

  it("F12: without the Google env vars the sign-in page has no Google button and the email form works", async () => {
    const { page } = await openSession({ browser, viewport: MOBILE });
    await openSignIn(page);

    expect(await page.getByRole("button", { name: GOOGLE_BUTTON }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Email me a sign-in link" }).isVisible()).toBe(true);
  });

  it("F12: with the env vars “Continue with Google” is the first button and sends the browser to Google", async () => {
    const { page } = await openSession({ browser, viewport: MOBILE, baseURL: googleWorker.url });
    let googleUrl = "";
    // Never reach the real Google: capture where the browser is sent and answer with a stub page.
    await page.route("https://accounts.google.com/**", (route) => {
      googleUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google stub</h1>" });
    });
    await openSignIn(page);
    const google = page.getByRole("button", { name: GOOGLE_BUTTON });
    await google.waitFor();
    const buttons = await page.getByRole("button").allTextContents();

    expect(buttons[0]).toContain(GOOGLE_BUTTON);
    expect(await page.getByRole("button", { name: "Email me a sign-in link" }).isVisible()).toBe(true);

    await google.click();
    await page.getByRole("heading", { name: "Google stub" }).waitFor();
    const params = new URL(googleUrl).searchParams;

    expect(params.get("redirect_uri")).toBe(`${googleWorker.url}/api/auth/callback/google`);
    expect(new Set(params.get("scope")?.split(" "))).toEqual(new Set(["openid", "email", "profile"]));
  });

  it("F12: the pricing page shows Solo $5/mo and Agency $15/mo with the recomputed lines", async () => {
    const { page } = await openSession({ browser });
    await page.goto("/pricing");
    await page.getByText("$3.75").waitFor();
    const monthly = await page.locator("main").innerText();
    await page.getByRole("button", { name: "Yearly (2 months free)" }).first().click();
    await page.getByText("$50/yr").waitFor();
    const yearly = await page.locator("main").innerText();

    expect(monthly).toContain("$5/mo");
    expect(monthly).toContain("$15/mo");
    expect(monthly).toContain("$0.75");
    expect(monthly).toContain("$11.55");
    expect(yearly).toContain("$150/yr");
    expect(`${monthly}${yearly}`).not.toMatch(/\$29|\$290|\$79|\$790|\$7\.55|\$24\.85/);
  });

  it("F12: an unknown public path gets a real 404 page with noindex, known pages stay 200", async () => {
    const missing = await fetch(`${E2E_URL}/foo`);
    const html = await missing.text();
    const pricing = await fetch(`${E2E_URL}/pricing`);
    const { page } = await openSession({ browser });
    await page.goto("/foo");
    await page.getByRole("heading", { name: "Page not found" }).waitFor();

    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toMatch(/text\/html/);
    expect(missing.headers.get("x-robots-tag")).toBe("noindex");
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(pricing.status).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/foo");
  });

  it("F12: an invited teammate who signs in on the public page lands in the inbox, not onboarding", async () => {
    const ownerEmail = uniqueEmail("f12-owner");
    const memberEmail = uniqueEmail("f12-member");
    await createTrialAccount({ email: ownerEmail, plan: "agency" });
    const owner = await openSession({ browser });
    await signInWithUi({ page: owner.page, email: ownerEmail });
    await owner.page.getByRole("heading", { name: "Inbox" }).waitFor();
    await owner.page.goto("/app/team");
    await owner.page.getByLabel("Teammate email").fill(memberEmail);
    await owner.page.getByRole("button", { name: "Send invite" }).click();
    await owner.page.getByText(`Invite sent to ${memberEmail}`).waitFor();

    const member = await openSession({ browser });
    await signInWithUi({ page: member.page, email: memberEmail });
    await member.page.getByRole("heading", { name: "Inbox" }).waitFor();

    expect(new URL(member.page.url()).pathname).toBe("/app");
  });
});
