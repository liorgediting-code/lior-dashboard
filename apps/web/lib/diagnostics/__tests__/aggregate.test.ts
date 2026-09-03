import { describe, expect, it } from "vitest";
import { accountBaseline, aggregateByBucket, toDiagnosticInput, type DiagnosticMetricRow } from "../aggregate";
import { resolveThresholds, overriddenKeys } from "../thresholds";
import { DEFAULT_THRESHOLDS } from "../rules";
import type { DiagnosticThresholds } from "@dashboard-lior/shared";

function row(overrides: Partial<DiagnosticMetricRow> & Pick<DiagnosticMetricRow, "ad_id" | "date">): DiagnosticMetricRow {
  return {
    spend: 0,
    leads: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    link_clicks: 0,
    three_sec_video_views: 0,
    video_50_watched: 0,
    purchases: 0,
    ...overrides,
  };
}

const campaignOf = (adId: string) => (adId.startsWith("ad-") ? "campaign-1" : undefined);

describe("aggregateByBucket", () => {
  it("sums every funnel column across days and ads", () => {
    const totals = aggregateByBucket(
      [
        row({ ad_id: "ad-1", date: "2026-08-01", spend: 100, impressions: 1000, reach: 800, link_clicks: 20, three_sec_video_views: 250, video_50_watched: 100, leads: 3 }),
        row({ ad_id: "ad-2", date: "2026-08-01", spend: 50, impressions: 500, reach: 400, link_clicks: 10, three_sec_video_views: 120, video_50_watched: 50, leads: 1 }),
        row({ ad_id: "ad-1", date: "2026-08-02", spend: 100, impressions: 1000, reach: 900, link_clicks: 30, three_sec_video_views: 250, video_50_watched: 100, leads: 2 }),
      ],
      campaignOf
    ).get("campaign-1")!;

    expect(totals.spend).toBe(250);
    expect(totals.impressions).toBe(2500);
    expect(totals.reach).toBe(2100);
    expect(totals.linkClicks).toBe(60);
    expect(totals.threeSecVideoViews).toBe(620);
    expect(totals.video50Watched).toBe(250);
    expect(totals.leads).toBe(6);
  });

  it("coerces the strings postgrest returns for numeric columns", () => {
    const totals = aggregateByBucket(
      [row({ ad_id: "ad-1", date: "2026-08-01", spend: "12.50" as unknown as number, impressions: "100" as unknown as number })],
      campaignOf
    ).get("campaign-1")!;

    expect(totals.spend).toBe(12.5);
    expect(totals.impressions).toBe(100);
  });

  it("skips rows whose ad maps to no bucket", () => {
    const totals = aggregateByBucket([row({ ad_id: "orphan", date: "2026-08-01", spend: 999 })], campaignOf);
    expect(totals.size).toBe(0);
  });

  it("counts a day as active only when it actually spent", () => {
    const totals = aggregateByBucket(
      [
        row({ ad_id: "ad-1", date: "2026-08-01", spend: 100, impressions: 1000 }),
        // Meta returns zero-spend rows for paused days; they must not count.
        row({ ad_id: "ad-1", date: "2026-08-02", spend: 0, impressions: 0 }),
        row({ ad_id: "ad-1", date: "2026-08-03", spend: 80, impressions: 900 }),
      ],
      campaignOf
    ).get("campaign-1")!;

    expect(totals.daysActive).toBe(2);
  });

  it("builds one impression-weighted CTR per day, oldest first", () => {
    const totals = aggregateByBucket(
      [
        // A tiny ad with a wild CTR must not drag the day's number around.
        row({ ad_id: "ad-1", date: "2026-08-02", spend: 1, impressions: 10_000, link_clicks: 100 }),
        row({ ad_id: "ad-2", date: "2026-08-02", spend: 1, impressions: 10, link_clicks: 5 }),
        row({ ad_id: "ad-1", date: "2026-08-01", spend: 1, impressions: 1000, link_clicks: 20 }),
      ],
      campaignOf
    ).get("campaign-1")!;

    expect(totals.dailyCtr).toHaveLength(2);
    expect(totals.dailyCtr[0]).toBeCloseTo(0.02); // 2026-08-01 first
    expect(totals.dailyCtr[1]).toBeCloseTo(105 / 10_010);
  });

  it("leaves out days with no impressions rather than emitting a zero CTR", () => {
    const totals = aggregateByBucket(
      [
        row({ ad_id: "ad-1", date: "2026-08-01", spend: 5, impressions: 1000, link_clicks: 20 }),
        row({ ad_id: "ad-1", date: "2026-08-02", spend: 0, impressions: 0, link_clicks: 0 }),
      ],
      campaignOf
    ).get("campaign-1")!;

    expect(totals.dailyCtr).toEqual([0.02]);
  });
});

describe("toDiagnosticInput", () => {
  const totals = aggregateByBucket(
    [row({ ad_id: "ad-1", date: "2026-08-01", spend: 100, impressions: 1000, link_clicks: 20, leads: 4, purchases: 1, three_sec_video_views: 200 })],
    campaignOf
  ).get("campaign-1")!;

  it("counts leads as conversions for a lead-gen campaign", () => {
    const input = toDiagnosticInput("c1", "קמפיין", totals, { dateRangeLabel: "30 ימים", targetCpa: null, conversionGoal: "leads" });
    expect(input.conversions).toBe(4);
  });

  it("counts purchases as conversions for an e-commerce campaign", () => {
    const input = toDiagnosticInput("c1", "קמפיין", totals, { dateRangeLabel: "30 ימים", targetCpa: null, conversionGoal: "purchases" });
    expect(input.conversions).toBe(1);
  });

  it("treats any 3-second view as evidence the creative was video", () => {
    const input = toDiagnosticInput("c1", "קמפיין", totals, { dateRangeLabel: "30 ימים", targetCpa: null, conversionGoal: "leads" });
    expect(input.hasVideo).toBe(true);
  });

  it("treats an ad with no 3-second views as a static image", () => {
    const still = aggregateByBucket([row({ ad_id: "ad-1", date: "2026-08-01", spend: 100, impressions: 1000 })], campaignOf).get("campaign-1")!;
    const input = toDiagnosticInput("c1", "קמפיין", still, { dateRangeLabel: "30 ימים", targetCpa: null, conversionGoal: "leads" });
    expect(input.hasVideo).toBe(false);
  });
});

describe("accountBaseline", () => {
  it("averages CPC and CPM across the whole account, not across campaign averages", () => {
    const totals = aggregateByBucket(
      [
        row({ ad_id: "ad-1", date: "2026-08-01", spend: 900, impressions: 30_000, link_clicks: 300 }),
        row({ ad_id: "ad-2", date: "2026-08-01", spend: 100, impressions: 10_000, link_clicks: 100 }),
      ],
      () => "one-bucket"
    );

    const baseline = accountBaseline(totals.values());
    expect(baseline.avgCpc).toBeCloseTo(1000 / 400);
    expect(baseline.avgCpm).toBeCloseTo((1000 / 40_000) * 1000);
  });

  it("returns nulls for an account with no traffic, silencing the two relative rules", () => {
    expect(accountBaseline([])).toEqual({ avgCpc: null, avgCpm: null });
  });
});

describe("resolveThresholds", () => {
  function thresholdRow(overrides: Partial<DiagnosticThresholds>): DiagnosticThresholds {
    return {
      id: "t1",
      client_id: null,
      hook_rate: null,
      hold_rate: null,
      ctr_link_click: null,
      cpc_account_multiple: null,
      landing_page_conversion_rate: null,
      frequency: null,
      cpm_account_multiple: null,
      min_impressions: null,
      min_spend: null,
      min_days_active: null,
      updated_at: "2026-09-01T00:00:00Z",
      ...overrides,
    };
  }

  it("falls back to the code defaults with no rows at all", () => {
    expect(resolveThresholds(null, null)).toEqual(DEFAULT_THRESHOLDS);
  });

  it("treats a null column as inherit, not as zero", () => {
    const resolved = resolveThresholds(thresholdRow({ min_impressions: 5000 }), null);
    expect(resolved.min_impressions).toBe(5000);
    expect(resolved.ctr_link_click).toBe(DEFAULT_THRESHOLDS.ctr_link_click);
    expect(resolved.hook_rate).toBe(DEFAULT_THRESHOLDS.hook_rate);
  });

  it("lets a client row override the global one column by column", () => {
    const resolved = resolveThresholds(
      thresholdRow({ ctr_link_click: 0.015, min_spend: 200 }),
      thresholdRow({ client_id: "client-1", ctr_link_click: 0.004 })
    );
    expect(resolved.ctr_link_click).toBe(0.004);
    expect(resolved.min_spend).toBe(200);
  });

  it("coerces the strings postgrest returns for numeric threshold columns", () => {
    const resolved = resolveThresholds(thresholdRow({ hook_rate: "0.15" as unknown as number }), null);
    expect(resolved.hook_rate).toBe(0.15);
  });

  it("reports which thresholds differ from the defaults", () => {
    const resolved = resolveThresholds(null, thresholdRow({ client_id: "c", frequency: 5 }));
    expect(overriddenKeys(resolved)).toEqual(["frequency"]);
  });
});
