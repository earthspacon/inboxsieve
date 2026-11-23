import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  COLD_LEAD,
  createSource,
  createTrialAccount,
  HOT_LEAD,
  launchBrowser,
  MOBILE,
  openSession,
  postWebhookLead,
  signInWithUi,
  uniqueEmail,
  waitForLead,
  type Session,
} from "./helpers";

const MAX_HEADER_PX = 64;
const SAME_ROW_TOLERANCE_PX = 4;

async function measureHeader(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    const box = header?.getBoundingClientRect();
    const centers = Array.from(header?.querySelectorAll("a, button") ?? [])
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rect.top + rect.height / 2);
    return {
      height: Math.round(box?.height ?? 0),
      rowSpread: centers.length ? Math.max(...centers) - Math.min(...centers) : 0,
    };
  });
}

describe("Layout at 390", () => {
  let browser: Browser;
  let session: Session;
  let leadId = "";

  beforeAll(async () => {
    browser = await launchBrowser();
    session = await openSession({ browser, viewport: MOBILE });
    const email = uniqueEmail("layout");
    const { brandId } = await createTrialAccount({ email });
    await signInWithUi({ page: session.page, email });
    const source = await createSource({ page: session.page, brandId, kind: "webhook" });
    const leads = await Promise.all(
      [HOT_LEAD, COLD_LEAD].map((lead) => {
        return postWebhookLead({ url: source.webhookUrl ?? "", lead });
      }),
    );
    leadId = leads[0].id;
    await Promise.all(
      leads.map((lead) => {
        return waitForLead({ page: session.page, brandId, leadId: lead.id, until: (found) => found.score !== null });
      }),
    );
  });

  afterAll(async () => {
    await browser.close();
  });

  it("the public header stays one row", async () => {
    const { page } = session;
    for (const path of ["/", "/pricing"]) {
      await page.goto(path);
      const header = await measureHeader(page);

      expect(header.height, `${path} header height`).toBeLessThanOrEqual(MAX_HEADER_PX);
      expect(header.rowSpread, `${path} header row spread`).toBeLessThanOrEqual(SAME_ROW_TOLERANCE_PX);
    }
  });

  it("the app header stays one row", async () => {
    const { page } = session;
    for (const path of ["/app", `/app/leads/${leadId}`]) {
      await page.goto(path);
      await page.locator("header").first().waitFor();
      const header = await measureHeader(page);

      expect(header.height, `${path} header height`).toBeLessThanOrEqual(MAX_HEADER_PX);
      expect(header.rowSpread, `${path} header row spread`).toBeLessThanOrEqual(SAME_ROW_TOLERANCE_PX);
    }
  });

  it("the reply-draft buttons are not covered by the bottom nav", async () => {
    const { page } = session;
    await page.goto(`/app/leads/${leadId}`);
    await page.getByLabel("Reply draft").waitFor();
    const buttons = await page.getByRole("button", { name: /Save draft|Copy|Mark replied/ }).all();
    const covered: string[] = [];
    for (const button of buttons) {
      const isTopmost = await button.evaluate((element) => {
        element.scrollIntoView({ block: "center" });
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      });
      if (!isTopmost) {
        covered.push((await button.textContent()) ?? "");
      }
    }

    expect(covered).toEqual([]);
  });

  it("the end of the lead page clears the bottom nav", async () => {
    const { page } = session;
    await page.goto(`/app/leads/${leadId}`);
    await page.getByLabel("Reply draft").waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gap = await page.evaluate(() => {
      const nav = document.querySelector("nav.fixed");
      const lastCard = document.querySelector("main")?.lastElementChild;
      return Math.round((nav?.getBoundingClientRect().top ?? 0) - (lastCard?.getBoundingClientRect().bottom ?? 0));
    });

    expect(gap).toBeGreaterThanOrEqual(0);
  });
});
