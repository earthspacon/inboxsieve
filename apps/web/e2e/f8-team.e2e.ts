import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addSeatByHand,
  apiJson,
  createTrialAccount,
  launchBrowser,
  openSession,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

describe("F8 team", () => {
  let browser: Browser;
  let owner: Session;
  let member: Session;
  const memberEmail = uniqueEmail("f8-member");

  beforeAll(async () => {
    browser = await launchBrowser();
    const ownerEmail = uniqueEmail("f8-owner");
    const { accountId } = await createTrialAccount({ email: ownerEmail });
    await addSeatByHand({ accountId, email: memberEmail });
    owner = await openSession({ browser });
    await signInWithUi({ page: owner.page, email: ownerEmail });
    await owner.page.getByRole("heading", { name: "Inbox" }).waitFor();
    member = await openSession({ browser });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F8: the one plan has one seat, so an invite shows the write-to-us prompt", async () => {
    const { page } = owner;
    await page.goto("/app/team");
    await page.getByLabel("Teammate email").fill(uniqueEmail("f8-extra"));
    await page.getByRole("button", { name: "Send invite" }).click();
    await page.getByText(/Your plan has no room for another seat/).waitFor();

    expect(await page.getByRole("link", { name: "Write to us" }).isVisible()).toBe(true);
  });

  it("F8: a seat added by hand turns active when the teammate signs in", async () => {
    const { page } = owner;
    await signInWithUi({ page: member.page, email: memberEmail });
    await member.page.getByRole("heading", { name: "Inbox" }).waitFor();
    await page.reload();
    await seatRow(memberEmail).getByText("Active").waitFor();

    const me = await apiJson<{ role: string; account: { id: string } }>({ page: member.page, path: "/api/me" });
    const ownerMe = await apiJson<{ account: { id: string } }>({ page, path: "/api/me" });
    expect(me.body.role).toBe("member");
    expect(me.body.account.id).toBe(ownerMe.body.account.id);
  });

  it("F8: a revoked seat's session gets 401 and the app sends them to sign-in", async () => {
    const { page } = owner;
    await page.getByRole("button", { name: `Revoke ${memberEmail}` }).click();
    await seatRow(memberEmail).waitFor({ state: "detached" });

    const me = await apiJson({ page: member.page, path: "/api/me" });
    expect(me.status).toBe(401);
    await member.page.goto("/app");
    await member.page.getByText("Sign in or start free").waitFor();
  });

  function seatRow(email: string) {
    return owner.page.locator("section > div", { hasText: email });
  }
});
