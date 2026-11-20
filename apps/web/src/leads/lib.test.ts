import { describe, expect, it } from "vitest";

import { analyzeLead } from "./analyzer";
import type { Lead } from "./config";
import { applyAnalysis, approveDraft, canMoveLead, getDashboardStats, moveLead } from "./lib";
import { buildMockLeads, MOCK_LEADS } from "./mock-leads";

const AT = "2026-11-20T10:00:00.000Z";
const NOW = Date.parse(AT);

function buildNewLead(index: number): Lead {
  const { hoursAgo: _hoursAgo, later: _later, ...mock } = MOCK_LEADS[index];
  return {
    ...mock,
    receivedAt: AT,
    stage: "new",
    history: [{ stage: "new", at: AT }],
    analysis: null,
    draft: "",
  };
}

describe("pipeline transitions", () => {
  it("moves a qualified lead to replied and records the change", () => {
    const lead = { ...buildNewLead(0), stage: "qualified" as const };
    const moved = moveLead({ lead, stage: "replied", at: AT });

    expect(moved.stage).toBe("replied");
    expect(moved.history.at(-1)).toEqual({ stage: "replied", at: AT });
  });

  it("refuses to skip from new straight to won", () => {
    const lead = buildNewLead(0);

    expect(canMoveLead({ lead, stage: "won" })).toBe(false);
    expect(moveLead({ lead, stage: "won", at: AT })).toBe(lead);
  });

  it("does not move a won lead anywhere", () => {
    const lead = { ...buildNewLead(0), stage: "won" as const };

    expect(canMoveLead({ lead, stage: "lost" })).toBe(false);
  });

  it("approving a draft marks the lead replied", () => {
    const lead = { ...buildNewLead(0), stage: "qualified" as const };

    expect(approveDraft({ lead, at: AT }).stage).toBe("replied");
  });

  it("analysis qualifies a hot lead, archives spam and leaves a cold lead new", () => {
    const qualify = (index: number) => {
      const lead = buildNewLead(index);
      return applyAnalysis({ lead, analysis: analyzeLead(lead), at: AT }).stage;
    };

    expect(qualify(0)).toBe("qualified");
    expect(qualify(5)).toBe("lost");
    expect(qualify(4)).toBe("new");
  });

  it("analysis does not pull back a lead that already moved on", () => {
    const lead = { ...buildNewLead(0), stage: "replied" as const };

    expect(applyAnalysis({ lead, analysis: analyzeLead(lead), at: AT }).stage).toBe("replied");
  });
});

describe("dashboard stats", () => {
  it("counts the funnel from stage history, so won leads also count as replied", () => {
    const stats = getDashboardStats({ leads: buildMockLeads({ now: NOW }), now: NOW });
    const funnel = Object.fromEntries(stats.funnel.map(({ stage, count }) => [stage, count]));

    expect(funnel.new).toBe(MOCK_LEADS.length);
    expect(funnel.won).toBe(1);
    expect(funnel.replied).toBe(3);
  });

  it("spreads the seed leads over the weekly chart and excludes spam from the average", () => {
    const stats = getDashboardStats({ leads: buildMockLeads({ now: NOW }), now: NOW });

    expect(stats.weekly.reduce((sum, week) => sum + week.count, 0)).toBe(MOCK_LEADS.length);
    expect(stats.spam).toBe(2);
    expect(stats.averageScore).toBeGreaterThan(0);
  });
});
