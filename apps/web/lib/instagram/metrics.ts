import type { IgDailyMetrics, IgMedia } from "@dashboard-lior/shared";

// Pure parsing/derivation over Instagram insights data. Deliberately free of
// `server-only` and of igGet/Supabase so it can be unit-tested — same split
// as lib/metrics/campaign-stats.ts. The Graph calls and upserts live in
// ./insights.ts.

/**
 * Coerces a raw value (Graph JSON number, or a postgrest numeric string) to
 * a number, but preserves "no value" as null instead of collapsing it to 0.
 * Number(null) === 0 is exactly the bug that would turn "Instagram didn't
 * report this metric" into "this metric was zero today".
 */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** One metric's `values` as the insights edge returns them, e.g. [{ value, end_time }]. */
type InsightValue = { value: number; end_time?: string };
type InsightEntry = { name: string; values: InsightValue[] };

const ACCOUNT_METRIC_COLUMNS = ["reach", "views", "total_interactions", "profile_views"] as const;
type AccountMetricColumn = (typeof ACCOUNT_METRIC_COLUMNS)[number];

/** One day's worth of account-level metric values, keyed by our column names. */
export type AccountMetricsByDate = Map<string, Partial<Record<AccountMetricColumn, number>>>;

/**
 * Folds one metric's daily insights entry into a date -> value map. Absence
 * from `entry.values` (Meta's `unavailable[]` case) means the date is never
 * written for that column, so it stays null in the final row — never 0.
 */
export function mergeAccountMetricEntry(byDate: AccountMetricsByDate, column: AccountMetricColumn, entry: InsightEntry | undefined): void {
  if (!entry) return;
  for (const { value, end_time } of entry.values) {
    if (!end_time) continue;
    const date = end_time.slice(0, 10);
    const row = byDate.get(date) ?? {};
    row[column] = value;
    byDate.set(date, row);
  }
}

/**
 * Builds the ig_daily_metrics upsert rows for one account from the merged
 * per-date metric map plus followers_count.
 *
 * followers_count is a single point-in-time value read off the account node,
 * so it is attached to the NEWEST day present — deliberately not to "today".
 * Instagram's insights lag up to 48h, so the newest row is routinely
 * yesterday or older; pinning the follower count to today's date meant it
 * matched no row at all and was silently never stored.
 */
export function buildDailyMetricRows(
  igAccountId: string,
  byDate: AccountMetricsByDate,
  followersCount: number | null
): Array<Pick<IgDailyMetrics, "ig_account_id" | "date" | "reach" | "views" | "total_interactions" | "profile_views" | "followers_count">> {
  const newestDate = [...byDate.keys()].sort().at(-1);
  const rows: Array<Pick<IgDailyMetrics, "ig_account_id" | "date" | "reach" | "views" | "total_interactions" | "profile_views" | "followers_count">> = [];
  for (const [date, values] of byDate) {
    rows.push({
      ig_account_id: igAccountId,
      date,
      reach: values.reach ?? null,
      views: values.views ?? null,
      total_interactions: values.total_interactions ?? null,
      profile_views: values.profile_views ?? null,
      followers_count: date === newestDate ? followersCount : null,
    });
  }
  return rows;
}

/** Raw shape of one post's insights entries, keyed by metric name. */
export type MediaInsightsMap = Partial<Record<"views" | "reach" | "saved" | "shares" | "likes" | "comments", number>>;

/**
 * Turns one media insights response's `data` array into a lookup by metric
 * name. A metric Meta didn't return is simply absent — callers must not
 * default missing keys to 0.
 */
export function parseMediaInsights(entries: InsightEntry[] | undefined): MediaInsightsMap {
  const map: MediaInsightsMap = {};
  for (const entry of entries ?? []) {
    const value = entry.values?.[0]?.value;
    if (value === undefined) continue;
    if (entry.name === "views" || entry.name === "reach" || entry.name === "saved" || entry.name === "shares" || entry.name === "likes" || entry.name === "comments") {
      map[entry.name] = value;
    }
  }
  return map;
}

export type PeriodChange = {
  current: number | null;
  previous: number | null;
  /** Percent change vs. the previous period. Null when it cannot be computed meaningfully. */
  changePct: number | null;
};

/**
 * Period-over-period change, following deriveStats' rule: an undefined
 * denominator (no previous value, or a previous value of 0) yields null
 * rather than Infinity/NaN — there is no percentage to show, not a 0%.
 */
export function periodChange(current: number | null, previous: number | null): PeriodChange {
  if (current === null || previous === null || previous === 0) {
    return { current, previous, changePct: null };
  }
  return { current, previous, changePct: ((current - previous) / previous) * 100 };
}

/** Sums a nullable numeric column across rows, treating null as "not counted" rather than 0. */
export function sumNullable<T>(rows: T[], pick: (row: T) => number | null): number | null {
  let sum: number | null = null;
  for (const row of rows) {
    const v = pick(row);
    if (v === null) continue;
    sum = (sum ?? 0) + v;
  }
  return sum;
}

/**
 * Sorts posts by performance (views, falling back to reach when views is
 * null) for the per-post table. Posts with no metric at all sort last —
 * they must not be treated as a performance of 0 and rank above real zeros.
 */
export function sortByPerformance<T extends { views: number | null; reach: number | null }>(rows: T[]): T[] {
  const score = (row: T): number | null => row.views ?? row.reach ?? null;
  return [...rows].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa === null && sb === null) return 0;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  });
}

/** Truncates a caption for the table cell; Instagram captions can be very long. */
export function truncateCaption(caption: string | null, maxLength = 60): string {
  if (!caption) return "";
  const trimmed = caption.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

/** The subset of ig_daily_metrics used to build a 30-day trend. */
export type TrendPoint = Pick<IgDailyMetrics, "date" | "reach" | "views">;

/** Sorts daily metric rows ascending by date for a left-to-right trend chart. */
export function sortTrend(rows: TrendPoint[]): TrendPoint[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

export type MediaRow = Pick<IgMedia, "views" | "reach" | "likes" | "comments_count" | "saved" | "shares" | "media_type" | "caption" | "permalink" | "posted_at" | "thumbnail_url" | "media_id">;

/** The most recent non-null value in date order. Used for followers_count, a snapshot rather than a daily total. */
export function lastNonNull<T>(rowsAscendingByDate: T[], pick: (row: T) => number | null): number | null {
  for (let i = rowsAscendingByDate.length - 1; i >= 0; i--) {
    const v = pick(rowsAscendingByDate[i]);
    if (v !== null) return v;
  }
  return null;
}

export type AccountSummary = {
  reach: PeriodChange;
  views: PeriodChange;
  totalInteractions: PeriodChange;
  profileViews: PeriodChange;
  followers: PeriodChange;
};

/**
 * Builds the five summary cards: sums for the flow metrics (reach, views,
 * interactions, profile views) and a last-value comparison for followers
 * (a snapshot, not something that sums meaningfully across days).
 */
export function summarizeAccountMetrics(
  current: Array<Pick<IgDailyMetrics, "reach" | "views" | "total_interactions" | "profile_views" | "followers_count">>,
  previous: Array<Pick<IgDailyMetrics, "reach" | "views" | "total_interactions" | "profile_views" | "followers_count">>
): AccountSummary {
  return {
    reach: periodChange(
      sumNullable(current, (r) => r.reach),
      sumNullable(previous, (r) => r.reach)
    ),
    views: periodChange(
      sumNullable(current, (r) => r.views),
      sumNullable(previous, (r) => r.views)
    ),
    totalInteractions: periodChange(
      sumNullable(current, (r) => r.total_interactions),
      sumNullable(previous, (r) => r.total_interactions)
    ),
    profileViews: periodChange(
      sumNullable(current, (r) => r.profile_views),
      sumNullable(previous, (r) => r.profile_views)
    ),
    followers: periodChange(
      lastNonNull(current, (r) => r.followers_count),
      lastNonNull(previous, (r) => r.followers_count)
    ),
  };
}
