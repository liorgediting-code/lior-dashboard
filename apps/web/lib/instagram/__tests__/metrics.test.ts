import { describe, expect, it } from "vitest";
import {
  buildDailyMetricRows,
  lastNonNull,
  mergeAccountMetricEntry,
  parseMediaInsights,
  periodChange,
  sortByPerformance,
  sortTrend,
  summarizeAccountMetrics,
  sumNullable,
  toNum,
  truncateCaption,
  type AccountMetricsByDate,
} from "../metrics";

describe("toNum", () => {
  it("passes through numbers", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(0)).toBe(0);
  });

  it("coerces postgrest numeric strings", () => {
    expect(toNum("123")).toBe(123);
  });

  it("returns null for null/undefined/empty instead of 0", () => {
    // Number(null) === 0 is the exact bug this guards against: a metric
    // Instagram never returned must not be stored (or summed) as a zero.
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum("")).toBeNull();
  });

  it("returns null for unparsable strings rather than NaN", () => {
    expect(toNum("not-a-number")).toBeNull();
  });
});

describe("mergeAccountMetricEntry", () => {
  it("writes each day's value under its column", () => {
    const byDate: AccountMetricsByDate = new Map();
    mergeAccountMetricEntry(byDate, "reach", {
      name: "reach",
      values: [
        { value: 100, end_time: "2026-08-10T07:00:00+0000" },
        { value: 120, end_time: "2026-08-11T07:00:00+0000" },
      ],
    });
    expect(byDate.get("2026-08-10")).toEqual({ reach: 100 });
    expect(byDate.get("2026-08-11")).toEqual({ reach: 120 });
  });

  it("does nothing when the metric entry is missing (unavailable[])", () => {
    // Meta lists metrics it won't serve in `unavailable[]` instead of
    // erroring; the caller passes `undefined` for those, and no date should
    // get a value for that column at all — not even a 0.
    const byDate: AccountMetricsByDate = new Map();
    mergeAccountMetricEntry(byDate, "profile_views", undefined);
    expect(byDate.size).toBe(0);
  });

  it("merges multiple metrics onto the same date", () => {
    const byDate: AccountMetricsByDate = new Map();
    mergeAccountMetricEntry(byDate, "reach", { name: "reach", values: [{ value: 50, end_time: "2026-08-10T07:00:00+0000" }] });
    mergeAccountMetricEntry(byDate, "views", { name: "views", values: [{ value: 80, end_time: "2026-08-10T07:00:00+0000" }] });
    expect(byDate.get("2026-08-10")).toEqual({ reach: 50, views: 80 });
  });
});

describe("buildDailyMetricRows", () => {
  it("fills unmerged columns with null, never 0", () => {
    const byDate: AccountMetricsByDate = new Map([["2026-08-10", { reach: 5 }]]);
    const rows = buildDailyMetricRows("acct-1", byDate, 27);
    expect(rows).toEqual([
      { ig_account_id: "acct-1", date: "2026-08-10", reach: 5, views: null, total_interactions: null, profile_views: null, followers_count: 27 },
    ]);
  });

  it("attaches followers_count only to the newest row", () => {
    const byDate: AccountMetricsByDate = new Map([
      ["2026-08-11", { reach: 1 }],
      ["2026-08-12", { reach: 2 }],
    ]);
    const rows = buildDailyMetricRows("acct-1", byDate, 27);
    expect(rows.find((r) => r.date === "2026-08-12")?.followers_count).toBe(27);
    expect(rows.find((r) => r.date === "2026-08-11")?.followers_count).toBeNull();
  });

  // Regression: followers_count used to be pinned to "today". Instagram's
  // insights lag 24-48h, so the newest row is routinely older than today —
  // the count then matched no row and was silently never stored.
  it("still stores followers_count when the newest day lags behind today", () => {
    const byDate: AccountMetricsByDate = new Map([
      ["2026-08-09", { reach: 1 }],
      ["2026-08-10", { reach: 2 }],
    ]);
    const rows = buildDailyMetricRows("acct-1", byDate, 27);
    expect(rows.find((r) => r.date === "2026-08-10")?.followers_count).toBe(27);
    expect(rows.some((r) => r.followers_count === 27)).toBe(true);
  });

  it("does not crash on an empty window", () => {
    expect(buildDailyMetricRows("acct-1", new Map(), 27)).toEqual([]);
  });
});

describe("parseMediaInsights", () => {
  it("maps known metric names to values", () => {
    const map = parseMediaInsights([
      { name: "views", values: [{ value: 300 }] },
      { name: "likes", values: [{ value: 12 }] },
    ]);
    expect(map).toEqual({ views: 300, likes: 12 });
  });

  it("omits metrics that are absent instead of defaulting to 0", () => {
    const map = parseMediaInsights([{ name: "views", values: [{ value: 300 }] }]);
    expect(map.saved).toBeUndefined();
    expect("saved" in map).toBe(false);
  });

  it("handles an empty/undefined response without throwing", () => {
    expect(parseMediaInsights(undefined)).toEqual({});
    expect(parseMediaInsights([])).toEqual({});
  });
});

describe("periodChange", () => {
  it("computes percent change", () => {
    expect(periodChange(120, 100).changePct).toBe(20);
  });

  it("returns null changePct when the previous value is null (small account, no history)", () => {
    expect(periodChange(120, null).changePct).toBeNull();
  });

  it("returns null changePct when current is null", () => {
    expect(periodChange(null, 100).changePct).toBeNull();
  });

  it("returns null changePct rather than Infinity when previous is 0", () => {
    expect(periodChange(50, 0).changePct).toBeNull();
  });
});

describe("sumNullable", () => {
  it("sums present values and skips nulls", () => {
    const rows = [{ v: 1 }, { v: null }, { v: 3 }];
    expect(sumNullable(rows, (r) => r.v)).toBe(4);
  });

  it("returns null when every value is null (never a fake 0)", () => {
    const rows = [{ v: null }, { v: null }];
    expect(sumNullable(rows, (r) => r.v)).toBeNull();
  });
});

describe("sortByPerformance", () => {
  it("sorts by views descending", () => {
    const rows = [
      { id: "a", views: 10, reach: 20 },
      { id: "b", views: 30, reach: 5 },
    ];
    expect(sortByPerformance(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("falls back to reach when views is null", () => {
    const rows = [
      { id: "a", views: null, reach: 5 },
      { id: "b", views: null, reach: 50 },
    ];
    expect(sortByPerformance(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts posts with no metrics at all to the end, not as a 0", () => {
    const rows = [
      { id: "no-metrics", views: null, reach: null },
      { id: "has-views", views: 1, reach: null },
    ];
    expect(sortByPerformance(rows).map((r) => r.id)).toEqual(["has-views", "no-metrics"]);
  });
});

describe("truncateCaption", () => {
  it("returns short captions unchanged", () => {
    expect(truncateCaption("hello")).toBe("hello");
  });

  it("truncates long captions with an ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncateCaption(long, 10);
    expect(result).toBe("aaaaaaaaaa…");
  });

  it("returns empty string for null caption", () => {
    expect(truncateCaption(null)).toBe("");
  });
});

describe("sortTrend", () => {
  it("sorts ascending by date", () => {
    const rows = [
      { date: "2026-08-12", reach: 1, views: 1 },
      { date: "2026-08-10", reach: 1, views: 1 },
    ];
    expect(sortTrend(rows).map((r) => r.date)).toEqual(["2026-08-10", "2026-08-12"]);
  });
});

describe("lastNonNull", () => {
  it("returns the most recent non-null value", () => {
    const rows = [{ v: 10 }, { v: null }, { v: 27 }];
    expect(lastNonNull(rows, (r) => r.v)).toBe(27);
  });

  it("skips trailing nulls and finds an earlier value", () => {
    const rows = [{ v: 10 }, { v: 27 }, { v: null }];
    expect(lastNonNull(rows, (r) => r.v)).toBe(27);
  });

  it("returns null when every value is null", () => {
    const rows = [{ v: null }, { v: null }];
    expect(lastNonNull(rows, (r) => r.v)).toBeNull();
  });
});

describe("summarizeAccountMetrics", () => {
  it("sums flow metrics and diffs the last followers snapshot", () => {
    const current = [
      { reach: 10, views: 20, total_interactions: 1, profile_views: 2, followers_count: 25 },
      { reach: 15, views: 25, total_interactions: 2, profile_views: 3, followers_count: 27 },
    ];
    const previous = [
      { reach: 5, views: 10, total_interactions: 1, profile_views: 1, followers_count: 20 },
      { reach: 5, views: 10, total_interactions: 1, profile_views: 1, followers_count: 22 },
    ];
    const summary = summarizeAccountMetrics(current, previous);
    expect(summary.reach).toEqual({ current: 25, previous: 10, changePct: 150 });
    expect(summary.followers.current).toBe(27);
    expect(summary.followers.previous).toBe(22);
  });

  it("leaves changePct null when a metric is null across the whole period", () => {
    const current = [{ reach: null, views: null, total_interactions: null, profile_views: null, followers_count: null }];
    const previous = [{ reach: null, views: null, total_interactions: null, profile_views: null, followers_count: null }];
    const summary = summarizeAccountMetrics(current, previous);
    expect(summary.reach.changePct).toBeNull();
    expect(summary.followers.changePct).toBeNull();
  });
});
