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

describe("F1 sign-in", () => {
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

  it("F1: a new email signs in by magic link and goes straight to onboarding on the Free plan", async () => {
    const { page } = session;
    await signInWithUi({ page, email });
    await page.getByRole("heading", { name: "What's the business called?" }).waitFor();
    const me = await apiJson<{ account: { id: string; plan: string; subscription: string } }>({
      page,
      path: "/api/me",
    });
    accountId = me.body.account.id;
    const brands = await apiJson({ page, path: "/api/brands" });

    expect(new URL(page.url()).pathname).toBe("/app/onboarding");
    expect(me.body.account).toMatchObject({ plan: "free", subscription: "no_subscription" });
    expect(brands.status).toBe(200);
  });

  it("F1: a bad Paddle signature is refused and the account stays on Free", async () => {
    const result = await sendPaddleFixture({ fixture: "subscription.created", accountId, secret: "pdl_ntfset_wrong" });
    const me = await apiJson<{ account: { plan: string } }>({ page: session.page, path: "/api/me" });

    expect(result.status).toBe(401);
    expect(me.body.account.plan).toBe("free");
  });

  it("F1: the signed subscription.created webhook moves the account onto the paid plan", async () => {
    const { page } = session;

    const result = await sendPaddleFixture({ fixture: "subscription.created", accountId });
    await page.goto("/app/billing");
    await page.getByRole("heading", { name: "You're on the $4 / month plan" }).waitFor();

    expect(result.body.outcome).toBe("applied");
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
    await page.getByText("Sign in or start free").waitFor();
    const me = await apiJson({ page, path: "/api/me" });

    expect(me.status).toBe(401);
  });

  it("F1: no console errors along the way", () => {
    expect(session.consoleErrors).toEqual([]);
  });
});
