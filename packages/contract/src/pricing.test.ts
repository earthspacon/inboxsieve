import { describe, expect, it } from "vitest";

import { buildPriceBreakdown, formatUsd, PLAN_PRICES, type PriceBreakdown } from "./pricing";

function sumLines(breakdown: PriceBreakdown) {
  return breakdown.paymentCents + breakdown.aiCents + breakdown.hostingCents + breakdown.ourFeeCents;
}

describe("plan prices", () => {
  it("one paid plan: $4 a month, Free stays $0 (owner 2026-11-23 21:41)", () => {
    expect(PLAN_PRICES).toEqual({
      free: { monthlyCents: 0 },
      solo: { monthlyCents: 400 },
    });
  });
});

describe("itemized price breakdown", () => {
  it("$4: Paddle 5% + 50¢ = $0.70, AI $0.20, hosting $0.30, our fee $2.80", () => {
    expect(buildPriceBreakdown("solo")).toEqual({
      priceCents: 400,
      paymentCents: 70,
      aiCents: 20,
      hostingCents: 30,
      ourFeeCents: 280,
    });
  });

  it("the lines of the paid plan add up to exactly its price", () => {
    const breakdown = buildPriceBreakdown("solo");

    expect(sumLines(breakdown)).toBe(breakdown.priceCents);
    expect(breakdown.ourFeeCents).toBeGreaterThan(0);
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
    expect(formatUsd(1155)).toBe("$11.55");
  });
});
