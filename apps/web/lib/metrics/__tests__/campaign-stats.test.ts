import { describe, expect, it } from "vitest";
import { deriveStats, groupTotals, statsFor, sumTotals, trailingDays } from "../campaign-stats";

function row(adId: string, spend: number, leads: number, impressions: number, clicks: number) {
  return { ad_id: adId, spend, leads, impressions, clicks };
}

describe("groupTotals", () => {
  it("rolls per-ad rows up to their bucket", () => {
    const adToCampaign = new Map([
      ["ad-1", "camp-a"],
      ["ad-2", "camp-a"],
      ["ad-3", "camp-b"],
    ]);
    const totals = groupTotals(
      [row("ad-1", 100, 2, 1000, 50), row("ad-2", 50, 1, 500, 20), row("ad-3", 30, 0, 300, 5)],
      (adId) => adToCampaign.get(adId)
    );

    expect(totals.get("camp-a")).toEqual({ spend: 150, leads: 3, impressions: 1500, clicks: 70 });
    expect(totals.get("camp-b")).toEqual({ spend: 30, leads: 0, impressions: 300, clicks: 5 });
  });

  it("skips rows whose ad maps to no bucket", () => {
    // An ad can outlive the campaign it was synced under; it must not crash
    // or silently land in some other campaign's totals.
    const totals = groupTotals([row("orphan", 999, 9, 9, 9)], () => undefined);
    expect(totals.size).toBe(0);
  });

  it("adds numeric strings instead of concatenating them", () => {
    // postgrest returns `numeric` columns as strings — `+=` on those would
    // produce "0100100" and every derived metric would be nonsense.
    const totals = groupTotals(
      [
        { ad_id: "ad-1", spend: "100" as unknown as number, leads: "2" as unknown as number, impressions: 10, clicks: 1 },
        { ad_id: "ad-1", spend: "50" as unknown as number, leads: "1" as unknown as number, impressions: 10, clicks: 1 },
      ],
      () => "bucket"
    );
    expect(totals.get("bucket")?.spend).toBe(150);
    expect(totals.get("bucket")?.leads).toBe(3);
  });
});

describe("deriveStats", () => {
  it("computes the ratio metrics", () => {
    const stats = deriveStats({ spend: 200, leads: 4, impressions: 10_000, clicks: 200 });
    expect(stats.cpl).toBe(50);
    expect(stats.ctr).toBe(2);
    expect(stats.cpc).toBe(1);
    expect(stats.cpm).toBe(20);
  });

  it("returns null rather than Infinity when a denominator is zero", () => {
    const stats = deriveStats({ spend: 200, leads: 0, impressions: 0, clicks: 0 });
    expect(stats.cpl).toBeNull();
    expect(stats.ctr).toBeNull();
    expect(stats.cpc).toBeNull();
    expect(stats.cpm).toBeNull();
  });
});

describe("statsFor", () => {
  it("reports a zeroed row for a bucket with no metrics at all", () => {
    // A campaign synced but never delivered still has to render.
    const stats = statsFor(new Map(), "camp-a");
    expect(stats.spend).toBe(0);
    expect(stats.cpl).toBeNull();
  });
});

describe("sumTotals", () => {
  it("adds up bucket totals", () => {
    expect(
      sumTotals([
        { spend: 10, leads: 1, impressions: 100, clicks: 5 },
        { spend: 5, leads: 2, impressions: 50, clicks: 3 },
      ])
    ).toEqual({ spend: 15, leads: 3, impressions: 150, clicks: 8 });
  });
});

describe("trailingDays", () => {
  it("returns an inclusive window ending today", () => {
    // 30 days INCLUSIVE of today means the range spans 29 days back, not 30.
    expect(trailingDays(30, new Date(2026, 7, 10))).toEqual({ since: "2026-07-12", until: "2026-08-10" });
  });

  it("crosses a year boundary", () => {
    expect(trailingDays(7, new Date(2026, 0, 3))).toEqual({ since: "2025-12-28", until: "2026-01-03" });
  });
});
