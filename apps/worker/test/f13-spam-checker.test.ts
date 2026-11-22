import {
  SPAM_CHECKER_API_PATH,
  SPAM_CHECKER_RUNS_PER_DAY,
  type Analysis,
  type SpamCheckResultDto,
} from "@inboxsieve/contract";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { handleRequest } from "../src/app";
import { VALID_ANALYSIS, buildTestDeps, countRows, createMockAnalyzer, db } from "./helpers";
import { BASE } from "./session";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const TOOL_SPEND_ACCOUNT = "public-spam-checker";
const REAL_REQUEST =
  "Hi, I run three dental clinics in Austin and need a new website. Budget is around $15k, we'd like to start in March.";

function uniqueIp() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

function buildCheckRequest({
  body,
  token = DUMMY_TOKEN,
  ip = uniqueIp(),
}: {
  body: unknown;
  token?: string;
  ip?: string;
}) {
  return new Request(`${BASE}${SPAM_CHECKER_API_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "cf-connecting-ip": ip,
      ...(token ? { "x-turnstile-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readToolSpend() {
  const row = await db
    .prepare("SELECT COALESCE(SUM(usd), 0) AS usd FROM llm_spend WHERE account_id = ?")
    .bind(TOOL_SPEND_ACCOUNT)
    .first<{ usd: number }>();
  return row?.usd ?? 0;
}

async function dumpDatabase() {
  const tables = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>();
  const dump: Record<string, string> = {};
  for (const { name } of tables.results) {
    const rows = await db.prepare(`SELECT * FROM "${name}"`).all();
    dump[name] = JSON.stringify(rows.results);
  }
  return dump;
}

function checkWithMock({
  reply = () => VALID_ANALYSIS,
  costUsd = 0,
  body,
  ip,
}: {
  reply?: () => Analysis;
  costUsd?: number;
  body: unknown;
  ip?: string;
}) {
  const mock = createMockAnalyzer(reply, { costUsd });
  const { deps } = buildTestDeps({ analyzer: mock.analyzer });
  const response = handleRequest({ deps, request: buildCheckRequest({ body, ip }) });
  return { mock, response };
}

describe("Free spam checker: abuse control", () => {
  it("a run without a Turnstile token gets 403 and the engine is not called", async () => {
    const mock = createMockAnalyzer();
    const { deps } = buildTestDeps({ analyzer: mock.analyzer });

    const response = await handleRequest({
      deps,
      request: buildCheckRequest({ body: { message: REAL_REQUEST, idealClient: "" }, token: "" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "captcha_failed" });
    expect(mock.calls).toHaveLength(0);
  });

  it("a run with a forged Turnstile token gets 403 through the public route", async () => {
    const response = await SELF.fetch(
      buildCheckRequest({ body: { message: REAL_REQUEST, idealClient: "" }, token: "forged-token" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "captcha_failed" });
  });

  it("one IP gets 10 runs a day; the 11th gets 429 and the engine is not called", async () => {
    const ip = uniqueIp();
    const statuses = [];
    for (let run = 0; run < SPAM_CHECKER_RUNS_PER_DAY; run += 1) {
      const response = await SELF.fetch(buildCheckRequest({ body: { message: REAL_REQUEST, idealClient: "" }, ip }));
      statuses.push(response.status);
    }
    const { mock, response } = checkWithMock({ body: { message: REAL_REQUEST, idealClient: "" }, ip });
    const blocked = await response;

    expect(statuses).toEqual(Array(SPAM_CHECKER_RUNS_PER_DAY).fill(200));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: "rate_limited" });
    expect(mock.calls).toHaveLength(0);
  });

  it("over the global daily AI budget the check answers 503 and the engine is not called", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare(
        `INSERT INTO llm_spend (day, account_id, usd) VALUES (?, 'cap-filler', 1000)
         ON CONFLICT (day, account_id) DO UPDATE SET usd = 1000`,
      )
      .bind(day)
      .run();

    const { mock, response } = checkWithMock({ body: { message: REAL_REQUEST, idealClient: "" } });
    const answer = await response;
    await db.prepare("DELETE FROM llm_spend WHERE account_id = 'cap-filler'").run();

    expect(answer.status).toBe(503);
    expect(await answer.json()).toMatchObject({ error: "busy" });
    expect(mock.calls).toHaveLength(0);
  });

  it("an empty or oversized message gets 400 before any bot check", async () => {
    const empty = await SELF.fetch(buildCheckRequest({ body: { message: "   ", idealClient: "" } }));
    const huge = await SELF.fetch(buildCheckRequest({ body: { message: "a".repeat(5001), idealClient: "" } }));

    expect(empty.status).toBe(400);
    expect(huge.status).toBe(400);
  });
});

describe("Free spam checker: result", () => {
  it("a real request comes back as 'request' with the engine's score and reasons, scored against the ideal client", async () => {
    const { mock, response } = checkWithMock({
      body: { message: REAL_REQUEST, idealClient: "Dental and medical clinics with $10k+ budgets" },
      costUsd: 0.0004,
    });
    const answer = await response;
    const result: SpamCheckResultDto = await answer.json();

    expect(answer.status).toBe(200);
    expect(result).toEqual({
      verdict: "request",
      score: VALID_ANALYSIS.score,
      summary: VALID_ANALYSIS.summary,
      reasons: VALID_ANALYSIS.reasons,
    });
    expect(mock.calls[0]?.lead.message).toBe(REAL_REQUEST);
    expect(mock.calls[0]?.profile.idealClient).toBe("Dental and medical clinics with $10k+ budgets");
  });

  it("a run's AI cost counts toward the global daily budget", async () => {
    const before = await readToolSpend();

    await (await checkWithMock({ body: { message: REAL_REQUEST, idealClient: "" }, costUsd: 0.0004 }).response).json();

    expect(await readToolSpend()).toBeCloseTo(before + 0.0004, 6);
  });

  it("a vendor pitch comes back as 'pitch'", async () => {
    const { response } = checkWithMock({
      body: { message: "We have an offshore team of 40 developers available for your overflow work.", idealClient: "" },
      reply: () => {
        return {
          ...VALID_ANALYSIS,
          score: 8,
          category: "cold",
          intent: "job",
        };
      },
    });

    expect(((await (await response).json()) as SpamCheckResultDto).verdict).toBe("pitch");
  });

  it("rule spam comes back as 'spam' without an AI call", async () => {
    const { mock, response } = checkWithMock({
      body: { message: "Dear sir, we sell cheap backlinks. Click here to rank #1.", idealClient: "" },
    });
    const result: SpamCheckResultDto = await (await response).json();

    expect(result.verdict).toBe("spam");
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("Free spam checker: nothing pasted is stored", () => {
  it("neither the message nor the ideal-client text lands in any table, and no lead row is created", async () => {
    const marker = `marker-${crypto.randomUUID()}`;
    const leadsBefore = await countRows({ sql: "SELECT COUNT(*) AS n FROM leads", binds: [] });

    const { response } = checkWithMock({
      body: { message: `${REAL_REQUEST} ${marker}-message`, idealClient: `${marker}-ideal` },
      costUsd: 0.0001,
    });
    expect((await response).status).toBe(200);

    const dump = await dumpDatabase();
    for (const [table, rows] of Object.entries(dump)) {
      expect(rows, table).not.toContain(marker);
    }
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM leads", binds: [] })).toBe(leadsBefore);
  });
});
