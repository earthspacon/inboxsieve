import { describe, expect, it } from "vitest";

import { buildPriceBreakdown, formatUsd, PLAN_PRICES, type PriceBreakdown } from "./pricing";

function sumLines(breakdown: PriceBreakdown) {
  return breakdown.paymentCents + breakdown.aiCents + breakdown.hostingCents + breakdown.ourFeeCents;
}

describe("plan prices", () => {
  it("Free is $0, Solo $9/mo or $90/yr, Agency $29/mo or $290/yr (owner 2026-11-21)", () => {
    expect(PLAN_PRICES).toEqual({
      free: { monthlyCents: 0, yearlyCents: 0 },
      solo: { monthlyCents: 900, yearlyCents: 9000 },
      agency: { monthlyCents: 2900, yearlyCents: 29000 },
    });
  });

  it("a year costs ten months on both paid plans (2 months free)", () => {
    expect(PLAN_PRICES.solo.yearlyCents).toBe(PLAN_PRICES.solo.monthlyCents * 10);
    expect(PLAN_PRICES.agency.yearlyCents).toBe(PLAN_PRICES.agency.monthlyCents * 10);
  });
});

describe("itemized price breakdown", () => {
  it("Solo $9: Paddle 5% + 50¢ = $0.95, AI $0.20, hosting $0.30, our fee $7.55", () => {
    expect(buildPriceBreakdown("solo")).toEqual({
      priceCents: 900,
      paymentCents: 95,
      aiCents: 20,
      hostingCents: 30,
      ourFeeCents: 755,
    });
  });

  it("Agency $29: Paddle 5% + 50¢ = $1.95, AI $1.20, hosting $1.00, our fee $24.85", () => {
    expect(buildPriceBreakdown("agency")).toEqual({
      priceCents: 2900,
      paymentCents: 195,
      aiCents: 120,
      hostingCents: 100,
      ourFeeCents: 2485,
    });
  });

  it("the lines of every paid plan add up to exactly its price", () => {
    for (const plan of ["solo", "agency"] as const) {
      const breakdown = buildPriceBreakdown(plan);

      expect(sumLines(breakdown)).toBe(breakdown.priceCents);
      expect(breakdown.ourFeeCents).toBeGreaterThan(0);
    }
  });

  it("Free has no payment fee and no fee of ours; we pay its AI and hosting", () => {
    const free = buildPriceBreakdown("free");

    expect(free).toMatchObject({ priceCents: 0, paymentCents: 0, ourFeeCents: 0 });
    expect(free.aiCents).toBe(2);
    expect(free.hostingCents).toBe(3);
  });

  it("the Paddle fee rounds 5% to whole cents before adding 50¢", () => {
    expect(buildPriceBreakdown("solo", { priceCents: 1999 }).paymentCents).toBe(150);
    expect(buildPriceBreakdown("solo", { priceCents: 1990 }).paymentCents).toBe(150);
    expect(buildPriceBreakdown("solo", { priceCents: 1989 }).paymentCents).toBe(149);
  });
});

describe("formatUsd", () => {
  it("formats cents as dollars with two decimals", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(95)).toBe("$0.95");
    expect(formatUsd(2485)).toBe("$24.85");
  });
});
