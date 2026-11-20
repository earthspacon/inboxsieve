import type { LeadDetailDto } from "@inboxsieve/contract";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiJson,
  COLD_LEAD,
  createSource,
  createTrialAccount,
  HOT_LEAD,
  launchBrowser,
  openSession,
  postWebhookLead,
  signInWithUi,
  SPAM_LEAD,
  uniqueEmail,
  waitForLead,
  type Session,
} from "./helpers";

describe("F5 triage", () => {
  let browser: Browser;
  let session: Session;
  let brandId = "";
  const ids = {
    hot: "",
    cold: "",
    spam: "",
  };

  beforeAll(async () => {
    browser = await launchBrowser();
    session = await openSession({ browser });
    const email = uniqueEmail("f5");
    brandId = (await createTrialAccount({ email })).brandId;
    await signInWithUi({ page: session.page, email });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("F5: with no sources the inbox asks to connect one", async () => {
    const { page } = session;
    await page.goto("/app");
    const heading = page.getByRole("heading", { name: "Connect your first source" });
    await heading.waitFor();

    expect(await heading.isVisible()).toBe(true);
  });

  it('F5: with a source but no leads the inbox offers "Send a test lead"', async () => {
    const { page } = session;
    const source = await createSource({ page, brandId, kind: "webhook" });
    await page.reload();
    await page.getByRole("button", { name: "Send a test lead" }).waitFor();

    const leads = await Promise.all(
      [HOT_LEAD, COLD_LEAD, SPAM_LEAD].map((lead) => {
        return postWebhookLead({ url: source.webhookUrl ?? "", lead });
      }),
    );
    ids.hot = leads[0].id;
    ids.cold = leads[1].id;
    ids.spam = leads[2].id;
    await Promise.all(
      Object.values(ids).map((leadId) => {
        return waitForLead({ page, brandId, leadId, until: (lead) => lead.score !== null });
      }),
    );

    expect(leads.map((lead) => lead.status)).toContain("spam_filtered");
  });

  it("F5: the inbox filters by score and by stage", async () => {
    const { page } = session;
    await page.goto("/app");
    await page.getByText(HOT_LEAD.subject).waitFor();

    await page.getByLabel("Minimum score").selectOption("75");
    await page.getByText(COLD_LEAD.subject).waitFor({ state: "detached" });
    const hotVisible = await page.getByText(HOT_LEAD.subject).isVisible();
    const spamVisible = await page.getByText(SPAM_LEAD.subject).isVisible();

    await page.getByLabel("Minimum score").selectOption("0");
    await page.getByRole("button", { name: "Spam", exact: true }).first().click();
    await page.getByText(HOT_LEAD.subject).waitFor({ state: "detached" });
    const spamOnly = await page.getByText(SPAM_LEAD.subject).isVisible();

    expect(hotVisible).toBe(true);
    expect(spamVisible).toBe(false);
    expect(spamOnly).toBe(true);
  });

  it("F5: a filter that matches nothing shows its own empty state", async () => {
    const { page } = session;
    await page.getByLabel("Minimum score").selectOption("90");
    await page.getByText("No leads match these filters.").waitFor();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByText(HOT_LEAD.subject).waitFor();

    expect(await page.getByText(HOT_LEAD.subject).isVisible()).toBe(true);
  });

  it('F5: edit draft → copy → "Mark replied" moves the lead to contacted', async () => {
    const { page } = session;
    await page.goto(`/app/leads/${ids.hot}`);
    const draft = page.getByLabel("Reply draft");
    await draft.waitFor();
    await draft.fill("Hi Maya,\n\nHappy to talk on Thursday.\n\nAlex");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Draft saved").waitFor();
    await page.getByRole("button", { name: "Copy" }).click();
    await page.getByText("Draft copied").waitFor();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    await page.getByRole("button", { name: "Mark replied" }).click();
    await page.getByText("Marked as replied").waitFor();
    const { body } = await apiJson<LeadDetailDto>({ page, path: `/api/brands/${brandId}/leads/${ids.hot}` });

    expect(clipboard).toContain("Happy to talk on Thursday");
    expect(await page.getByText("Contacted", { exact: true }).first().isVisible()).toBe(true);
    expect(body.stage).toBe("contacted");
    expect(body.draft).toContain("Happy to talk on Thursday");
    expect(body.repliedAt).not.toBeNull();
  });

  it("F5: the compose links carry the edited draft", async () => {
    const { page } = session;
    const gmail = await page.getByRole("link", { name: "Open in Gmail" }).getAttribute("href");

    expect(new URL(gmail ?? "").searchParams.get("body")).toContain("Happy to talk on Thursday");
    expect(new URL(gmail ?? "").searchParams.get("to")).toBe(HOT_LEAD.email);
  });

  it('F5: "Not spam" moves the lead to new and stores the feedback', async () => {
    const { page } = session;
    await page.goto(`/app/leads/${ids.spam}`);
    await page.getByRole("button", { name: "Not spam" }).click();
    await page.getByText("Moved to New").waitFor();
    await page.getByText(/feedback: .* not_spam/).waitFor();
    const { body } = await apiJson<LeadDetailDto>({ page, path: `/api/brands/${brandId}/leads/${ids.spam}` });

    expect(body.stage).toBe("new");
    expect(body.events.some((event) => event.type === "feedback" && event.to === "not_spam")).toBe(true);
    expect(await page.getByText(/feedback: .* not_spam/).isVisible()).toBe(true);
  });

  it("F5: the pipeline shows the replied lead under Contacted", async () => {
    const { page } = session;
    await page.goto("/app/pipeline");
    const contacted = page.getByRole("region", { name: "Contacted" });

    await contacted.getByText(HOT_LEAD.name).waitFor();
    expect(await contacted.getByText(HOT_LEAD.name).isVisible()).toBe(true);
  });

  it("F5: no console errors on the pages above", () => {
    expect(session.consoleErrors).toEqual([]);
  });
});
