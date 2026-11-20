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
const TURNSTILE_SETTLE_MS = 1000;
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

    expectNoConsoleErrors(label);
  });

  it.each(VIEWPORTS)("public, team and billing pages ($label)", async ({ label, size }) => {
    const visitor = await openSession({ browser, viewport: size });
    const agency = await prepareAccount({ browser, viewport: size, plan: "agency" });
    await agency.session.page.goto("/app/team");
    await agency.session.page.getByLabel("Teammate email").fill(uniqueEmail("teammate"));
    await agency.session.page.getByRole("button", { name: "Send invite" }).click();
    await agency.session.page.getByText("2 of 3 seats used").waitFor();
    const free = await openSession({ browser, viewport: size });
    await signInWithUi({ page: free.page, email: uniqueEmail("free") });
    await free.page.getByRole("heading", { name: "What's the business called?" }).waitFor();

    await capture({ session: visitor, label, shot: LANDING });
    await capture({ session: visitor, label, shot: PRICING });
    await capture({ session: visitor, label, shot: SPAM_FILTER });
    await capture({ session: visitor, label, shot: CHILI_PIPER_ALTERNATIVE });
    await capture({ session: agency.session, label, shot: TEAM });
    await capture({ session: agency.session, label, shot: BILLING });
    await capture({ session: free, label, shot: BILLING_FREE });
    await capture({ session: free, label, shot: BILLING_TRIAL });

    expectNoConsoleErrors(label);
  });
});

function expectNoConsoleErrors(label: string) {
  expect(
    consoleReport
      .filter(({ shot }) => shot.endsWith(label))
      .every(({ errors }) => {
        return errors === 0;
      }),
  ).toBe(true);
}

const LANDING: Shot = {
  name: "landing",
  open: async (page) => {
    await page.goto("/");
    await page.getByRole("heading", { name: /Spam out, real clients first/ }).waitFor();
  },
};

const PRICING: Shot = {
  name: "pricing",
  open: async (page) => {
    await page.goto("/pricing");
    await page.getByText("$7.55").waitFor();
  },
};

const SPAM_FILTER: Shot = {
  name: "seo-contact-form-spam-filter",
  open: async (page) => {
    await page.goto("/contact-form-spam-filter");
    await page.getByRole("heading", { name: "Contact form spam filter for agencies" }).waitFor();
  },
};

const CHILI_PIPER_ALTERNATIVE: Shot = {
  name: "seo-chili-piper-alternative",
  open: async (page) => {
    await page.goto("/chili-piper-alternative");
    await page.getByRole("heading", { name: "Chili Piper alternative for small agencies" }).waitFor();
  },
};

const TEAM: Shot = {
  name: "team",
  open: async (page) => {
    await page.goto("/app/team");
    await page.getByText("Invited").waitFor();
  },
};

const BILLING: Shot = {
  name: "billing",
  open: async (page) => {
    await page.goto("/app/billing");
    await page.getByText("Current period ends").waitFor();
  },
};

const BILLING_FREE: Shot = {
  name: "billing-free",
  open: async (page) => {
    await page.goto("/app/billing");
    await page.getByRole("heading", { name: "You're on the Free plan" }).waitFor();
  },
};

const BILLING_TRIAL: Shot = {
  name: "billing-trial",
  open: async (page) => {
    await page.getByRole("button", { name: "Try Solo free for 14 days" }).click();
    await page.getByText(/Your Solo trial ends on/).waitFor();
  },
};

const SIGN_IN: Shot = {
  name: "sign-in",
  open: async (page) => {
    await page.goto("/sign-in");
    await page.getByText("Sign in or start free").waitFor();
    // The Turnstile test sitekey passes on its own; the button unlocks once the token is in.
    await page.locator("button[type=submit]:not([disabled])").waitFor();
    await page.waitForTimeout(TURNSTILE_SETTLE_MS);
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

async function prepareAccount({
  browser,
  viewport,
  plan = "solo",
}: {
  browser: Browser;
  viewport: typeof DESKTOP;
  plan?: "solo" | "agency";
}) {
  const email = uniqueEmail("shots");
  const { brandId } = await createTrialAccount({ email, plan });
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
