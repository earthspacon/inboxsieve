import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiJson,
  createTrialAccount,
  launchBrowser,
  openSession,
  readMagicLink,
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
    await createTrialAccount({ email: ownerEmail, plan: "agency" });
    owner = await openSession({ browser });
    await signInWithUi({ page: owner.page, email: ownerEmail });
    await owner.page.getByRole("heading", { name: "Inbox" }).waitFor();
    member = await openSession({ browser });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F8: an invite sends a magic link and the seat turns active when the teammate signs in", async () => {
    const { page } = owner;
    await page.goto("/app/team");
    await page.getByLabel("Teammate email").fill(memberEmail);
    await page.getByRole("button", { name: "Send invite" }).click();
    await page.getByText(`Invite sent to ${memberEmail}`).waitFor();
    await seatRow(memberEmail).getByText("Invited").waitFor();

    await member.page.goto(await readMagicLink(memberEmail));
    await member.page.getByRole("heading", { name: "Inbox" }).waitFor();
    await page.reload();
    await seatRow(memberEmail).getByText("Active").waitFor();

    const me = await apiJson<{ role: string; account: { id: string } }>({ page: member.page, path: "/api/me" });
    const ownerMe = await apiJson<{ account: { id: string } }>({ page, path: "/api/me" });
    expect(me.body.role).toBe("member");
    expect(me.body.account.id).toBe(ownerMe.body.account.id);
  });

  it("F8: the 4th seat on Agency shows the upgrade prompt", async () => {
    const { page } = owner;
    await page.getByLabel("Teammate email").fill(uniqueEmail("f8-third"));
    await page.getByRole("button", { name: "Send invite" }).click();
    await page.getByText("3 of 3 seats used").waitFor();

    await page.getByLabel("Teammate email").fill(uniqueEmail("f8-fourth"));
    await page.getByRole("button", { name: "Send invite" }).click();
    await page.getByText(/Your plan has no room for another seat/).waitFor();

    expect(await page.getByRole("link", { name: "Upgrade" }).isVisible()).toBe(true);
    expect(await page.getByText("3 of 3 seats used").isVisible()).toBe(true);
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
