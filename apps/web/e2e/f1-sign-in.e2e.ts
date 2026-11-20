import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiJson,
  launchBrowser,
  openSession,
  readMagicLink,
  sendPaddleFixture,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

describe("F1 sign-in and trial", () => {
  let browser: Browser;
  let session: Session;
  const email = uniqueEmail("f1");
  let accountId = "";

  beforeAll(async () => {
    browser = await launchBrowser();
    session = await openSession({ browser });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F1: a new email signs in by magic link and lands on the locked Finish checkout page", async () => {
    const { page } = session;
    await signInWithUi({ page, email });
    await page.getByRole("heading", { name: /Finish checkout/ }).waitFor();
    const me = await apiJson<{ account: { id: string; subscription: string } }>({ page, path: "/api/me" });
    accountId = me.body.account.id;
    const locked = await apiJson({ page, path: "/api/brands" });

    expect(new URL(page.url()).pathname).toBe("/app/checkout");
    expect(me.body.account.subscription).toBe("no_subscription");
    expect(locked.status).toBe(402);
    expect(await page.getByRole("button", { name: "Start 7-day trial" }).count()).toBe(2);
  });

  it("F1: a bad Paddle signature is refused and the account stays locked", async () => {
    const result = await sendPaddleFixture({ fixture: "subscription.created", accountId, secret: "pdl_ntfset_wrong" });
    const me = await apiJson<{ account: { subscription: string } }>({ page: session.page, path: "/api/me" });

    expect(result.status).toBe(401);
    expect(me.body.account.subscription).toBe("no_subscription");
  });

  it("F1: the signed subscription.created webhook moves the account to trialing and opens onboarding", async () => {
    const { page } = session;

    const result = await sendPaddleFixture({ fixture: "subscription.created", accountId });
    await page.reload();
    await page.getByRole("heading", { name: "What's the business called?" }).waitFor();

    expect(result.body.outcome).toBe("applied");
    expect(new URL(page.url()).pathname).toBe("/app/onboarding");
  });

  it('F1: a used magic link shows "Send a new link"', async () => {
    const link = await readMagicLink(email);
    const fresh = await openSession({ browser });

    await fresh.page.goto(link);
    await fresh.page.getByText("That sign-in link expired or was already used.").waitFor();

    expect(await fresh.page.getByRole("button", { name: "Send a new link" }).isVisible()).toBe(true);
  });

  it("F1: sign out ends the session", async () => {
    const { page } = session;
    await page.goto("/app/more");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.getByText("Sign in or start your trial").waitFor();
    const me = await apiJson({ page, path: "/api/me" });

    expect(me.status).toBe(401);
  });

  it("F1: no console errors along the way", () => {
    expect(session.consoleErrors).toEqual([]);
  });
});
