import { readFileSync } from "node:fs";

import { LEAD_CSV_COLUMNS, type SourceDto } from "@inboxsieve/contract";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_URL } from "./config";
import {
  apiJson,
  createSource,
  createTrialAccount,
  HOT_LEAD,
  launchBrowser,
  openSession,
  postWebhookLead,
  runMaintenanceAt,
  signInWithUi,
  uniqueEmail,
  type Session,
} from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("F9 data", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F9: the CSV export has the contract's columns and one row per lead", async () => {
    const { session } = await prepareAccountWithLead({ browser });
    const { page } = session;
    await page.goto("/app/data");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download CSV" }).click(),
    ]);
    const lines = readFileSync(await download.path(), "utf8")
      .trimEnd()
      .split("\r\n");

    expect(lines[0]).toBe(LEAD_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(HOT_LEAD.email);
  });

  it("F9: delete workspace needs DELETE typed, signs out, and the purge leaves 0 rows", async () => {
    const { session, accountId } = await prepareAccountWithLead({ browser });
    const { page } = session;
    await page.goto("/app/data");
    const deleteButton = page.getByRole("button", { name: "Delete workspace" });
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    expect(await deleteButton.isDisabled()).toBe(true);

    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await deleteButton.click();
    await page.getByText("Sign in or start your trial").waitFor();
    expect((await apiJson({ page, path: "/api/me" })).status).toBe(401);

    const before = await countAccountRows(accountId);
    expect(before.leads).toBe(1);
    await runMaintenanceAt(new Date());
    const after = await countAccountRows(accountId);
    expect(Object.values(after).every((count) => count === 0)).toBe(true);
  });

  it("F9: the purge job drops raw bodies older than 90 days", async () => {
    const { session, brandId, leadId } = await prepareAccountWithLead({ browser });
    const { page } = session;
    const originalPath = `/api/brands/${brandId}/leads/${leadId}/original`;
    expect((await page.request.get(originalPath)).status()).toBe(200);

    await runMaintenanceAt(new Date(Date.now() + 89 * DAY_MS));
    expect((await page.request.get(originalPath)).status()).toBe(200);

    await runMaintenanceAt(new Date(Date.now() + 91 * DAY_MS));
    expect((await page.request.get(originalPath)).status()).toBe(404);
    expect(
      (await apiJson<{ email: string }>({ page, path: `/api/brands/${brandId}/leads/${leadId}` })).body.email,
    ).toBe(HOT_LEAD.email);
  });
});

async function prepareAccountWithLead({ browser }: { browser: Browser }) {
  const email = uniqueEmail("f9");
  const { accountId, brandId } = await createTrialAccount({ email });
  const session: Session = await openSession({ browser });
  await signInWithUi({ page: session.page, email });
  await session.page.getByRole("heading", { name: "Inbox" }).waitFor();
  const source: SourceDto = await createSource({ page: session.page, brandId, kind: "webhook" });
  const { id: leadId } = await postWebhookLead({
    url: source.webhookUrl ?? "",
    lead: HOT_LEAD,
  });
  return {
    session,
    accountId,
    brandId,
    leadId,
  };
}

async function countAccountRows(accountId: string) {
  const response = await fetch(`${E2E_URL}/dev/account-rows?accountId=${accountId}`);
  return (await response.json()) as Record<string, number>;
}
