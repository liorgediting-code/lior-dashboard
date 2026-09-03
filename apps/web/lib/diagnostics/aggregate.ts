import type { AdMetricDaily } from "@dashboard-lior/shared";
import { isCtrDeclining, type AccountBaseline, type DiagnosticInput } from "./engine";

/**
 * Rolls daily per-ad rows up into the shape the engine evaluates.
 *
 * Pure, like ./engine.ts and lib/metrics/campaign-stats.ts — the Supabase
 * queries live in ./fetch.ts. Everything here is exercised by
 * __tests__/aggregate.test.ts against plain row fixtures.
 */

/** The subset of an ad_metrics_daily row the diagnostics read. */
export type DiagnosticMetricRow = Pick<
  AdMetricDaily,
  | "ad_id"
  | "date"
  | "spend"
  | "leads"
  | "impressions"
  | "clicks"
  | "reach"
  | "link_clicks"
  | "three_sec_video_views"
  | "video_50_watched"
  | "purchases"
>;

export type FunnelTotals = {
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  clicks: number;
  threeSecVideoViews: number;
  video50Watched: number;
  leads: number;
  purchases: number;
  /** Distinct dates on which this bucket spent anything. */
  daysActive: number;
  /** One CTR per date, oldest first, for the fatigue rule's trend check. */
  dailyCtr: number[];
};

function emptyTotals(): FunnelTotals {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    linkClicks: 0,
    clicks: 0,
    threeSecVideoViews: 0,
    video50Watched: 0,
    leads: 0,
    purchases: 0,
    daysActive: 0,
    dailyCtr: [],
  };
}

// postgrest hands numeric columns back as strings often enough that this is
// load-bearing rather than defensive — `+=` on a string concatenates, and
// every ratio downstream would be garbage. Same reasoning as
// lib/metrics/campaign-stats.ts.
function num(value: unknown): number {
  return Number(value) || 0;
}

/**
 * Groups rows into buckets (a campaign id, an adset id, an ad id — whatever
 * `bucketOf` names) and sums each one.
 *
 * The daily CTR series is built per bucket per DATE, summing across every ad
 * in the bucket first: taking each ad's own CTR and averaging would weight a
 * 40-impression ad the same as a 40,000-impression one, and the trend the
 * fatigue rule reads would follow whichever tiny ad was noisiest that day.
 */
export function aggregateByBucket(
  rows: Iterable<DiagnosticMetricRow>,
  bucketOf: (adId: string) => string | undefined
): Map<string, FunnelTotals> {
  const totals = new Map<string, FunnelTotals>();
  const perDay = new Map<string, Map<string, { impressions: number; linkClicks: number; spend: number }>>();

  for (const row of rows) {
    const bucket = bucketOf(row.ad_id);
    if (bucket === undefined) continue;

    const current = totals.get(bucket) ?? emptyTotals();
    current.spend += num(row.spend);
    current.impressions += num(row.impressions);
    current.reach += num(row.reach);
    current.linkClicks += num(row.link_clicks);
    current.clicks += num(row.clicks);
    current.threeSecVideoViews += num(row.three_sec_video_views);
    current.video50Watched += num(row.video_50_watched);
    current.leads += num(row.leads);
    current.purchases += num(row.purchases);
    totals.set(bucket, current);

    const days = perDay.get(bucket) ?? new Map();
    const day = days.get(row.date) ?? { impressions: 0, linkClicks: 0, spend: 0 };
    day.impressions += num(row.impressions);
    day.linkClicks += num(row.link_clicks);
    day.spend += num(row.spend);
    days.set(row.date, day);
    perDay.set(bucket, days);
  }

  for (const [bucket, days] of perDay) {
    const current = totals.get(bucket);
    if (!current) continue;

    const dates = [...days.keys()].sort();
    // "Active" means spent, not merely present: Meta returns rows with zero
    // spend for days an ad was paused, and counting those would let a
    // campaign that ran for one day clear a three-day minimum.
    current.daysActive = dates.filter((date) => (days.get(date)?.spend ?? 0) > 0).length;
    current.dailyCtr = dates
      .map((date) => days.get(date)!)
      .filter((day) => day.impressions > 0)
      .map((day) => day.linkClicks / day.impressions);
  }

  return totals;
}

export function toDiagnosticInput(
  id: string,
  name: string,
  totals: FunnelTotals,
  options: { dateRangeLabel: string; targetCpa: number | null; conversionGoal: "leads" | "purchases" }
): DiagnosticInput {
  return {
    campaignId: id,
    campaignName: name,
    dateRangeLabel: options.dateRangeLabel,
    impressions: totals.impressions,
    reach: totals.reach,
    spend: totals.spend,
    linkClicks: totals.linkClicks,
    threeSecVideoViews: totals.threeSecVideoViews,
    video50Watched: totals.video50Watched,
    conversions: options.conversionGoal === "purchases" ? totals.purchases : totals.leads,
    daysActive: totals.daysActive,
    targetCpa: options.targetCpa,
    ctrDeclining: isCtrDeclining(totals.dailyCtr),
    // Any 3-second view at all means video creative ran. A static image can
    // never produce one, so this is the cleanest signal available without a
    // second request to the creatives edge.
    hasVideo: totals.threeSecVideoViews > 0,
  };
}

/**
 * The account-wide CPC and CPM the "1.5× the account average" rules compare
 * a campaign against.
 *
 * Computed from the same window as the diagnosis rather than from a fixed
 * industry number: a fixed CPC ceiling is meaningless across niches, and a
 * campaign that costs twice what the rest of THIS account costs is the
 * finding worth surfacing. Null when the account has no traffic in the
 * window, which silences both rules instead of dividing by zero.
 */
export function accountBaseline(allTotals: Iterable<FunnelTotals>): AccountBaseline {
  let spend = 0;
  let impressions = 0;
  let linkClicks = 0;
  for (const totals of allTotals) {
    spend += totals.spend;
    impressions += totals.impressions;
    linkClicks += totals.linkClicks;
  }

  return {
    avgCpc: linkClicks > 0 ? spend / linkClicks : null,
    avgCpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}
