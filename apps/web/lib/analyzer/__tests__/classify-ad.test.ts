import { describe, expect, it } from "vitest";
import { classifyAd, classifyAdSetZeroLeads } from "../classify-ad";
import { calculateLeadValue } from "../calculate-lead-value";
import { calculateMaxCpl } from "../calculate-max-cpl";
import { SINGLE_AD_MIN_SPEND_FOR_KILL, ADSET_ZERO_LEAD_KILL_SPEND } from "../thresholds";

// max_cpl = 150 throughout, matching the seeded dental-clinic demo client
// (deal_price_avg 3000 * close_rate_pct 25% / profit_ratio 5 = 150).
const MAX_CPL = 150;

describe("calculateLeadValue", () => {
  it("route A uses real deal price + close rate", () => {
    const result = calculateLeadValue({ dealPriceAvg: 3000, closeRatePct: 25 });
    expect(result).toEqual({ value: 750, route: "A" });
  });

  it("route B uses revenue/deals + estimated close rate when route A data is missing", () => {
    const result = calculateLeadValue({
      monthlyRevenue: 40000,
      dealsPerMonth: 20,
      estimatedCloseRatePct: 20,
    });
    expect(result).toEqual({ value: 400, route: "B" });
  });

  it("route C falls back to the conservative default when there's no data at all", () => {
    const result = calculateLeadValue({ priceRangeLow: 100, conservativeCloseRatePct: 2 });
    expect(result).toEqual({ value: 2, route: "C" });
  });

  it("returns null when there isn't even route C data", () => {
    expect(calculateLeadValue({})).toBeNull();
  });
});

describe("calculateMaxCpl", () => {
  it("divides lead value by the profit ratio", () => {
    expect(calculateMaxCpl(750, 5)).toBe(150);
  });
});

describe("classifyAd", () => {
  it("WINNER when cpl <= maxCpl", () => {
    const result = classifyAd({ spend: 250, leads: 5, cpl: 50, maxCpl: MAX_CPL });
    expect(result.verdict).toBe("WINNER");
  });

  it("SUSPECT when maxCpl < cpl <= 2*maxCpl", () => {
    const result = classifyAd({ spend: 200, leads: 1, cpl: 200, maxCpl: MAX_CPL });
    expect(result.verdict).toBe("SUSPECT");
  });

  it("KILL when spend clears the threshold and cpl > 2*maxCpl", () => {
    const result = classifyAd({
      spend: SINGLE_AD_MIN_SPEND_FOR_KILL,
      leads: 1,
      cpl: 2 * MAX_CPL + 1,
      maxCpl: MAX_CPL,
    });
    expect(result.verdict).toBe("KILL");
  });

  it("INSUFFICIENT_DATA when cpl > 2*maxCpl but spend hasn't cleared the kill threshold", () => {
    const result = classifyAd({
      spend: SINGLE_AD_MIN_SPEND_FOR_KILL - 1,
      leads: 1,
      cpl: 2 * MAX_CPL + 1,
      maxCpl: MAX_CPL,
    });
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
  });

  it("KILL on 0 leads once spend clears the single-ad threshold", () => {
    const result = classifyAd({
      spend: SINGLE_AD_MIN_SPEND_FOR_KILL,
      leads: 0,
      cpl: null,
      maxCpl: MAX_CPL,
    });
    expect(result.verdict).toBe("KILL");
  });

  it("INSUFFICIENT_DATA on 0 leads before spend clears the single-ad threshold", () => {
    const result = classifyAd({
      spend: SINGLE_AD_MIN_SPEND_FOR_KILL - 1,
      leads: 0,
      cpl: null,
      maxCpl: MAX_CPL,
    });
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
  });

  it("boundary: cpl exactly at maxCpl is WINNER, not SUSPECT", () => {
    expect(classifyAd({ spend: 500, leads: 5, cpl: MAX_CPL, maxCpl: MAX_CPL }).verdict).toBe("WINNER");
  });

  it("boundary: cpl exactly at 2*maxCpl is SUSPECT, not KILL", () => {
    expect(
      classifyAd({ spend: SINGLE_AD_MIN_SPEND_FOR_KILL, leads: 1, cpl: 2 * MAX_CPL, maxCpl: MAX_CPL }).verdict
    ).toBe("SUSPECT");
  });
});

describe("classifyAdSetZeroLeads", () => {
  it("KILL when the whole set has 0 leads and spend clears the threshold", () => {
    const result = classifyAdSetZeroLeads({
      totalSpend: ADSET_ZERO_LEAD_KILL_SPEND,
      totalLeads: 0,
    });
    expect(result?.verdict).toBe("KILL");
  });

  it("null (no verdict) when spend hasn't cleared the whole-set threshold yet", () => {
    const result = classifyAdSetZeroLeads({
      totalSpend: ADSET_ZERO_LEAD_KILL_SPEND - 1,
      totalLeads: 0,
    });
    expect(result).toBeNull();
  });

  it("null (no verdict) once the set has at least one lead", () => {
    const result = classifyAdSetZeroLeads({
      totalSpend: ADSET_ZERO_LEAD_KILL_SPEND + 100,
      totalLeads: 1,
    });
    expect(result).toBeNull();
  });
});
