import { describe, expect, it } from "vitest";
import { currentPeriod, formatPeriod, periodFromStart, recentPeriods } from "../periods";
import { buildReportText } from "../build-report";
import { deriveStats } from "@/lib/metrics/campaign-stats";

describe("periodFromStart", () => {
  it("snaps a week back to Sunday, matching the questionnaire's week boundary", () => {
    // Wed 2026-08-05 belongs to the week that opened Sun 2026-08-02.
    expect(periodFromStart("week", "2026-08-05")).toEqual({ kind: "week", start: "2026-08-02", end: "2026-08-08" });
  });

  it("keeps a Sunday as its own week start", () => {
    expect(periodFromStart("week", "2026-08-09").start).toBe("2026-08-09");
  });

  it("snaps a month to the 1st and the last day", () => {
    // Normalisation matters: the unique index is on the start date, so an
    // un-snapped month could be stored twice.
    expect(periodFromStart("month", "2026-08-17")).toEqual({ kind: "month", start: "2026-08-01", end: "2026-08-31" });
  });

  it("handles February in a leap year", () => {
    expect(periodFromStart("month", "2028-02-10").end).toBe("2028-02-29");
  });

  it("crosses a year boundary for a week", () => {
    expect(periodFromStart("week", "2026-01-01")).toEqual({ kind: "week", start: "2025-12-28", end: "2026-01-03" });
  });
});

describe("currentPeriod", () => {
  it("returns the week containing today", () => {
    expect(currentPeriod("week", new Date(2026, 7, 10)).start).toBe("2026-08-09");
  });

  it("returns the month containing today", () => {
    expect(currentPeriod("month", new Date(2026, 7, 10))).toEqual({ kind: "month", start: "2026-08-01", end: "2026-08-31" });
  });
});

describe("recentPeriods", () => {
  it("walks back one week at a time without gaps or repeats", () => {
    const periods = recentPeriods("week", 3, new Date(2026, 7, 10));
    expect(periods.map((period) => period.start)).toEqual(["2026-08-09", "2026-08-02", "2026-07-26"]);
  });

  it("walks back across a month boundary", () => {
    const periods = recentPeriods("month", 3, new Date(2026, 0, 15));
    expect(periods.map((period) => period.start)).toEqual(["2026-01-01", "2025-12-01", "2025-11-01"]);
  });
});

describe("formatPeriod", () => {
  it("names the month for a monthly period", () => {
    expect(formatPeriod(periodFromStart("month", "2026-08-01"))).toBe("אוגוסט 2026");
  });

  it("shows the day range for a weekly period", () => {
    expect(formatPeriod(periodFromStart("week", "2026-08-02"))).toBe("2/8 – 8/8");
  });
});

describe("buildReportText", () => {
  const base = {
    clientName: "מספרת דנה",
    period: periodFromStart("week", "2026-08-02"),
    overall: deriveStats({ spend: 1000, leads: 20, impressions: 50_000, clicks: 500 }),
    campaigns: [
      { name: "קמפיין ראשי", stats: deriveStats({ spend: 1000, leads: 20, impressions: 50_000, clicks: 500 }) },
      { name: "קמפיין מושהה", stats: deriveStats({ spend: 0, leads: 0, impressions: 0, clicks: 0 }) },
    ],
    leadsCreated: 20,
    dealsClosed: 4,
    revenue: 8000,
  };

  it("leads with the client name and the period", () => {
    expect(buildReportText(base).split("\n")[0]).toBe("דוח שבועי · מספרת דנה · 2/8 – 8/8");
  });

  it("omits campaigns that didn't spend in the period", () => {
    // A paused campaign printed at ₪0 reads as a failure, not as "not running".
    const text = buildReportText(base);
    expect(text).toContain("קמפיין ראשי");
    expect(text).not.toContain("קמפיין מושהה");
  });

  it("includes the client's own feedback when there is any", () => {
    expect(buildReportText({ ...base, clientFeedback: "הלידים היו טובים" })).toContain("הלידים היו טובים");
    expect(buildReportText({ ...base, clientFeedback: "   " })).not.toContain("מה שסיפרתם לנו");
  });

  it("skips the ROI line when nothing was spent", () => {
    const text = buildReportText({
      ...base,
      overall: deriveStats({ spend: 0, leads: 0, impressions: 0, clicks: 0 }),
      revenue: 0,
      dealsClosed: 0,
    });
    expect(text).not.toContain("החזר על ההשקעה");
  });
});
