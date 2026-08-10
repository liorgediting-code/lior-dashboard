import type { AdMetricDaily } from "@dashboard-lior/shared";

// Pure aggregation over ad_metrics_daily rows. Deliberately free of
// `server-only` and of any Supabase import so it can be unit-tested — same
// split as lib/crm/questionnaire-week.ts. The queries live in ./fetch-stats.ts.
//
// NOTE ON "VIEWS": ad_metrics_daily stores impressions, not video views —
// Meta sync (lib/meta/sync.ts) never pulls a video_views field. Everywhere
// the UI says צפיות it means impressions; real view counts would need a
// sync change first.

export type MetricTotals = {
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
};

export type CampaignStats = MetricTotals & {
  /** Cost per lead. Null with no leads — an "infinite" CPL is not a number worth showing. */
  cpl: number | null;
  /** Click-through rate as a percentage. */
  ctr: number | null;
  /** Cost per click. */
  cpc: number | null;
  /** Cost per 1,000 impressions. */
  cpm: number | null;
};

/** The subset of an ad_metrics_daily row this module reads. */
type MetricRow = Pick<AdMetricDaily, "ad_id" | "spend" | "leads" | "impressions" | "clicks">;

export function emptyTotals(): MetricTotals {
  return { spend: 0, leads: 0, impressions: 0, clicks: 0 };
}

export function addRow(totals: MetricTotals, row: MetricRow): MetricTotals {
  // Numeric columns come back from postgrest as strings often enough that
  // Number() here is load-bearing, not defensive: `+=` on a string silently
  // concatenates and every derived metric downstream would be garbage.
  totals.spend += Number(row.spend) || 0;
  totals.leads += Number(row.leads) || 0;
  totals.impressions += Number(row.impressions) || 0;
  totals.clicks += Number(row.clicks) || 0;
  return totals;
}

export function sumTotals(rows: Iterable<MetricTotals>): MetricTotals {
  const total = emptyTotals();
  for (const row of rows) {
    total.spend += row.spend;
    total.leads += row.leads;
    total.impressions += row.impressions;
    total.clicks += row.clicks;
  }
  return total;
}

/** Adds the ratio metrics. Every denominator of 0 yields null rather than Infinity/NaN. */
export function deriveStats(totals: MetricTotals): CampaignStats {
  return {
    ...totals,
    cpl: totals.leads > 0 ? totals.spend / totals.leads : null,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
  };
}

/**
 * Rolls daily per-ad metrics up to whatever bucket `bucketOf` names — an
 * adset id, a campaign id, a funnel id. Rows whose ad maps to nothing are
 * skipped (an ad can outlive the campaign row it was synced under).
 */
export function groupTotals(rows: Iterable<MetricRow>, bucketOf: (adId: string) => string | undefined): Map<string, MetricTotals> {
  const byBucket = new Map<string, MetricTotals>();
  for (const row of rows) {
    const bucket = bucketOf(row.ad_id);
    if (bucket === undefined) continue;
    const current = byBucket.get(bucket) ?? emptyTotals();
    byBucket.set(bucket, addRow(current, row));
  }
  return byBucket;
}

export function statsFor(totalsByKey: Map<string, MetricTotals>, key: string): CampaignStats {
  return deriveStats(totalsByKey.get(key) ?? emptyTotals());
}

/** Inclusive yyyy-mm-dd range, matching how `ad_metrics_daily.date` is stored. */
export type DateRange = { since: string; until: string };

/** The trailing `days`-day window ending today, the default window across the dashboard. */
export function trailingDays(days: number, today: Date = new Date()): DateRange {
  const until = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}
