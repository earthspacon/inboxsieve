import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SHOTS_DIR as BASE_SHOTS_DIR } from "./config";
import {
  createSource,
  createTrialAccount,
  DESKTOP,
  HOT_LEAD,
  launchBrowser,
  MOBILE,
  openSession,
  PITCH_LEAD,
  postWebhookLead,
  signInWithUi,
  uniqueEmail,
  waitForLead,
} from "./helpers";

// Run with `SHOTS=1 vitest run --config vitest.e2e.config.ts pitches`.
const SHOTS_DIR = process.env.PITCHES_SHOTS_DIR ?? path.join(BASE_SHOTS_DIR, "pitches");

const AGENCY_PITCH = {
  name: "Lena Brooks",
  email: "lena@pixelforge.example",
  company: "PixelForge",
  subject: "White-label dev capacity for agencies",
  message:
    "Hi there, our developers are available for white-label projects at $25/hour. We have helped 40 agencies scale delivery.",
};

describe("pitches screenshots", () => {
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
  ])("Pitches tab with seeded leads ($label)", async ({ label, size }) => {
    const { page, consoleErrors } = await openSession({ browser, viewport: size });
    const email = uniqueEmail(`pitches-${label}`);
    const { brandId } = await createTrialAccount({ email });
    await signInWithUi({ page, email });
    const source = await createSource({ page, brandId, kind: "webhook" });
    const leads = await Promise.all(
      [HOT_LEAD, PITCH_LEAD, AGENCY_PITCH].map((lead) => {
        return postWebhookLead({ url: source.webhookUrl ?? "", lead });
      }),
    );
    await Promise.all(
      leads.map((lead) => {
        return waitForLead({ page, brandId, leadId: lead.id, until: (detail) => detail.score !== null });
      }),
    );

    await page.goto("/app");
    await page.getByText(HOT_LEAD.subject).waitFor();
    await page.getByRole("button", { name: "Pitches", exact: true }).click();
    await page.getByText(HOT_LEAD.subject).waitFor({ state: "detached" });
    await page.getByText(AGENCY_PITCH.subject).waitFor();
    await page.screenshot({ path: path.join(BASE_SHOTS_DIR, `pitches-${label}.png`), fullPage: true });

    expect(consoleErrors).toEqual([]);
  });
});
