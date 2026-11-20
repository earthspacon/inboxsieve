import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_URL, SHOTS_DIR } from "./config";
import {
  COLD_LEAD,
  createSource,
  createTrialAccount,
  DESKTOP,
  HOT_LEAD,
  launchBrowser,
  MOBILE,
  openSession,
  postEmail,
  postWebhookLead,
  signInWithUi,
  SPAM_LEAD,
  uniqueEmail,
  waitForLead,
  type Session,
} from "./helpers";

type Shot = { name: string; open: (page: Page) => Promise<void>; isViewportOnly?: boolean };

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../worker/fixtures");
const VIEWPORTS = [
  {
    label: "desktop",
    size: DESKTOP,
  },
  {
    label: "mobile",
    size: MOBILE,
  },
];
const consoleReport: Array<{ shot: string; errors: number }> = [];

describe("screenshots", () => {
  let browser: Browser;

  beforeAll(async () => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    browser = await launchBrowser();
  });

  afterAll(async () => {
    console.log(
      consoleReport
        .map(({ shot, errors }) => {
          return `${shot}: ${errors} console errors`;
        })
        .join("\n"),
    );
    await browser.close();
  });

  it.each(VIEWPORTS)("app pages ($label)", async ({ label, size }) => {
    const filled = await prepareFilledAccount({ browser, viewport: size });
    const empty = await prepareAccount({ browser, viewport: size });
    const full = await prepareFilledAccount({ browser, viewport: size });
    await fetch(`${E2E_URL}/dev/usage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brandId: full.brandId,
        count: 500,
      }),
    });

    await capture({ session: await openSession({ browser, viewport: size }), label, shot: SIGN_IN });
    await capture({ session: empty.session, label, shot: EMPTY_INBOX });
    await capture({ session: empty.session, label, shot: ONBOARDING_SOURCE });
    await capture({ session: filled.session, label, shot: FILLED_INBOX });
    await capture({ session: filled.session, label, shot: leadDetailShot(filled.hotId) });
    await capture({ session: filled.session, label, shot: PIPELINE });
    await capture({ session: filled.session, label, shot: SOURCES_PENDING });
    await capture({ session: full.session, label, shot: USAGE_BANNER });

    expect(
      consoleReport
        .filter(({ shot }) => shot.endsWith(label))
        .every(({ errors }) => {
          return errors === 0;
        }),
    ).toBe(true);
  });
});

const SIGN_IN: Shot = {
  name: "sign-in",
  open: async (page) => {
    await page.goto("/sign-in");
    await page.getByText("Sign in or start your trial").waitFor();
  },
};

const EMPTY_INBOX: Shot = {
  name: "inbox-empty",
  open: async (page) => {
    await page.goto("/app");
    await page.getByText("Connect your first source").waitFor();
  },
};

const ONBOARDING_SOURCE: Shot = {
  name: "onboarding-source",
  open: async (page) => {
    await page.goto("/app/onboarding");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Skip for now/ }).click();
    await page.getByRole("button", { name: "Forward email" }).click();
    await page.getByText("Waiting for the first message").waitFor();
  },
};

const FILLED_INBOX: Shot = {
  name: "inbox",
  open: async (page) => {
    await page.goto("/app");
    await page.getByText(HOT_LEAD.subject).waitFor();
  },
};

const PIPELINE: Shot = {
  name: "pipeline",
  open: async (page) => {
    await page.goto("/app/pipeline");
    await page.getByRole("region", { name: "New" }).getByText(HOT_LEAD.name).waitFor();
  },
};

const SOURCES_PENDING: Shot = {
  name: "sources-verification-pending",
  open: async (page) => {
    await page.goto("/app/sources");
    await page.getByText("Open the confirmation link").waitFor();
  },
};

const USAGE_BANNER: Shot = {
  name: "usage-banner",
  isViewportOnly: true,
  open: async (page) => {
    await page.goto("/app");
    await page.getByText(/You've used all 500 analyzed leads/).waitFor();
  },
};

function leadDetailShot(leadId: string): Shot {
  return {
    name: "lead-detail",
    open: async (page) => {
      await page.goto(`/app/leads/${leadId}`);
      await page.getByText("Why this score").waitFor();
    },
  };
}

async function capture({ session, label, shot }: { session: Session; label: string; shot: Shot }) {
  session.consoleErrors.length = 0;
  await shot.open(session.page);
  await session.page.screenshot({
    path: path.join(SHOTS_DIR, `${shot.name}-${label}.png`),
    fullPage: !shot.isViewportOnly,
  });
  consoleReport.push({
    shot: `${shot.name}-${label}`,
    errors: session.consoleErrors.length,
  });
}

async function prepareAccount({ browser, viewport }: { browser: Browser; viewport: typeof DESKTOP }) {
  const email = uniqueEmail("shots");
  const { brandId } = await createTrialAccount({ email });
  const session = await openSession({ browser, viewport });
  await signInWithUi({ page: session.page, email });
  await session.page.getByRole("heading", { name: "Inbox" }).waitFor();
  return {
    session,
    brandId,
  };
}

async function prepareFilledAccount({ browser, viewport }: { browser: Browser; viewport: typeof DESKTOP }) {
  const account = await prepareAccount({ browser, viewport });
  const { page } = account.session;
  const webhook = await createSource({ page, brandId: account.brandId, kind: "webhook" });
  const email = await createSource({ page, brandId: account.brandId, kind: "email" });
  const leads = [];
  for (const lead of [SPAM_LEAD, COLD_LEAD, HOT_LEAD]) {
    leads.push(await postWebhookLead({ url: webhook.webhookUrl ?? "", lead }));
  }
  await postEmail({
    to: email.address ?? "",
    raw: readFileSync(path.join(FIXTURES_DIR, "gmail-forward-confirm.eml"), "utf8"),
  });
  for (const lead of leads) {
    await waitForLead({ page, brandId: account.brandId, leadId: lead.id, until: (detail) => detail.score !== null });
  }
  return {
    ...account,
    hotId: leads[2].id,
  };
}
