import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { LeadDetailDto, SourceDto } from "@inboxsieve/contract";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { CHROME_PATH, E2E_URL, PADDLE_TEST_SECRET } from "./config";

export const DESKTOP = { width: 1440, height: 900 };
export const MOBILE = { width: 390, height: 844 };

const PADDLE_FIXTURES_DIR = path.resolve(import.meta.dirname, "../../worker/fixtures/paddle");
const LINK_PATTERN = /https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+/;
const POLL_MS = 300;
const POLL_TIMEOUT_MS = 15_000;

export type Session = {
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
};

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@agency.example`;
}

export async function launchBrowser() {
  return chromium.launch({ executablePath: CHROME_PATH });
}

export async function openSession({
  browser,
  viewport = DESKTOP,
  baseURL = E2E_URL,
}: {
  browser: Browser;
  viewport?: typeof DESKTOP;
  baseURL?: string;
}) {
  const context = await browser.newContext({
    baseURL,
    viewport,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  const session: Session = {
    context,
    page,
    consoleErrors,
  };
  return session;
}

export async function createTrialAccount({ email }: { email: string }) {
  const response = await fetch(`${E2E_URL}/dev/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return (await response.json()) as { accountId: string; brandId: string; userId: string };
}

export async function addSeatByHand({ accountId, email }: { accountId: string; email: string }) {
  await fetch(`${E2E_URL}/dev/seats`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, email }),
  });
}

export async function readMagicLink(email: string) {
  const response = await fetch(`${E2E_URL}/dev/outbox?to=${encodeURIComponent(email)}`);
  const mails = (await response.json()) as Array<{ body: string; subject: string }>;
  const link = mails[0]?.body.match(LINK_PATTERN)?.[0];

  if (!link) {
    throw new Error("no magic link in the dev outbox");
  }
  return link;
}

export async function signInWithUi({ page, email }: { page: Page; email: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /sign-in link|new link/i }).click();
  await page.getByText("Check your email").waitFor();
  await page.goto(await readMagicLink(email));
}

export async function apiJson<T>({
  page,
  path,
  method = "GET",
  body,
}: {
  page: Page;
  path: string;
  method?: string;
  body?: unknown;
}) {
  const response = await page.request.fetch(path, {
    method,
    data: body,
    headers: { origin: E2E_URL },
  });
  return {
    status: response.status(),
    body: (await response.json().catch(() => null)) as T,
  };
}

export async function createSource({
  page,
  brandId,
  kind,
}: {
  page: Page;
  brandId: string;
  kind: "email" | "webhook";
}) {
  const { body } = await apiJson<SourceDto>({
    page,
    path: `/api/brands/${brandId}/sources`,
    method: "POST",
    body: {
      kind,
      name: "",
    },
  });
  return body;
}

export async function postWebhookLead({
  url,
  lead,
}: {
  url: string;
  lead: { name: string; email: string; company: string; subject: string; message: string };
}) {
  const response = await fetch(url.replace(/^https?:\/\/[^/]+/, E2E_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify(lead),
  });
  return (await response.json()) as { id: string; status: string };
}

export async function postEmail({ to, raw }: { to: string; raw: string }) {
  const query = new URLSearchParams({
    from: "forwarder@agency.example",
    to,
  });
  return fetch(`${E2E_URL}/cdn-cgi/handler/email?${query.toString()}`, {
    method: "POST",
    body: raw,
  });
}

export async function waitForLead({
  page,
  brandId,
  leadId,
  until,
}: {
  page: Page;
  brandId: string;
  leadId: string;
  until: (lead: LeadDetailDto) => boolean;
}) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { body } = await apiJson<LeadDetailDto>({ page, path: `/api/brands/${brandId}/leads/${leadId}` });
    if (body && until(body)) {
      return body;
    }
    await fetch(`${E2E_URL}/dev/run-jobs`, { method: "POST" });
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
  throw new Error(`lead ${leadId} did not reach the expected state`);
}

export const HOT_LEAD = {
  name: "Maya Okafor",
  email: "maya@brightloop.example",
  company: "Brightloop",
  subject: "AI agent for support triage",
  message:
    "Hi! I'm the CEO of Brightloop, a B2B SaaS (40 people). We want an AI agent that triages support tickets and pushes qualified ones into our CRM. Budget is $25k–$40k and we'd like it live by end of Q1. Can we talk this week?",
};

export const COLD_LEAD = {
  name: "Chris Bell",
  email: "chris@studentmail.example",
  company: "",
  subject: "Question",
  message: "Hello, I'm a student writing a paper about agencies. Do you have any free resources I can read?",
};

export const SPAM_LEAD = {
  name: "SEO Team",
  email: "rank@seo-blast.example",
  company: "SEO Blast",
  subject: "Rank #1 on Google in 30 days",
  message: "We sell cheap backlinks and guaranteed first page ranking. Reply now for a discount.",
};

export const PITCH_LEAD = {
  name: "Ravi Menon",
  email: "ravi@devbench.example",
  company: "DevBench",
  subject: "Dedicated React developers for your studio",
  message:
    "Hello, we run an offshore team of 30 engineers and our developers are available from next month. Happy to send rates and case studies.",
};

export async function sendPaddleFixture({
  fixture,
  accountId,
  periodEnd,
  occurredAt = new Date(),
  secret = PADDLE_TEST_SECRET,
}: {
  fixture: string;
  accountId: string;
  periodEnd?: string;
  occurredAt?: Date;
  secret?: string;
}) {
  const event = JSON.parse(readFileSync(path.join(PADDLE_FIXTURES_DIR, `${fixture}.json`), "utf8"));
  event.event_id = `evt_${randomUUID().replaceAll("-", "")}`;
  event.occurred_at = occurredAt.toISOString();
  event.data.id = `sub_${accountId}`;
  event.data.custom_data = { account_id: accountId };
  if (periodEnd && event.data.current_billing_period) {
    event.data.current_billing_period.ends_at = periodEnd;
  }
  const body = JSON.stringify(event);
  const ts = String(Math.floor(Date.now() / 1000));
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  const response = await fetch(`${E2E_URL}/paddle/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paddle-signature": `ts=${ts};h1=${h1}`,
    },
    body,
  });
  return {
    status: response.status,
    body: (await response.json()) as { outcome?: string },
  };
}

export async function runMaintenanceAt(now: Date) {
  await fetch(`${E2E_URL}/dev/run-maintenance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ now: now.toISOString() }),
  });
}
