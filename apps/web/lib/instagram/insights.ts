import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { IG_ACCOUNT_ID, igGet, igGetNode, isInstagramConfigured, type IgInsightsResponse } from "./client";
import { buildDailyMetricRows, mergeAccountMetricEntry, parseMediaInsights, toNum, type AccountMetricsByDate } from "./metrics";

/** Re-synced trailing window: insights lag up to 48h and revise earlier days. */
const TRAILING_WINDOW_DAYS = 14;
const MEDIA_FIELDS = "id,media_type,caption,permalink,thumbnail_url,timestamp";
const MEDIA_INSIGHTS_METRICS = "views,reach,saved,shares,likes,comments";

/**
 * The account insights edge answers in two different shapes, and which one
 * you get depends on the metric. Verified against the live gateway:
 *
 *   reach                                    -> a real daily series in
 *                                               `values[]`, each with an
 *                                               `end_time`.
 *   views, total_interactions, profile_views -> NOTHING unless you pass
 *                                               `metric_type=total_value`,
 *                                               and then only a single
 *                                               `total_value` aggregate for
 *                                               the whole queried range.
 *
 * Asking for the second group without `metric_type` returns `{"data":[]}`,
 * which is how they silently came back null on every row.
 */
const SERIES_METRICS = ["reach"] as const;
const TOTAL_VALUE_METRICS = ["views", "total_interactions", "profile_views"] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/**
 * Each metric is its own request — a single comma-joined call would fail
 * entirely if any one metric is unavailable for this account (27 followers
 * means several will be), and isolating the try/catch keeps one bad metric
 * from aborting the sync.
 */
async function fetchSeriesMetric(name: string, since: string, until: string) {
  try {
    return await igGet<IgInsightsResponse>("insights", { metric: name, period: "day", since, until });
  } catch {
    return null;
  }
}

type TotalValueResponse = { data: Array<{ name: string; total_value?: { value?: number } }> };

/**
 * One day's totals for the aggregate-only metrics.
 *
 * The window is [date, date+1) — a range where since === until returns an
 * empty list, because Meta treats it as zero-length. Asking day by day is
 * the only way to get a daily series out of these three; it costs one
 * request per day, which is nothing on a daily cron.
 */
async function fetchTotalValuesForDay(date: string): Promise<Partial<Record<string, number>>> {
  try {
    const response = await igGet<TotalValueResponse>("insights", {
      metric: TOTAL_VALUE_METRICS.join(","),
      period: "day",
      metric_type: "total_value",
      since: date,
      until: addDays(date, 1),
    });
    const out: Partial<Record<string, number>> = {};
    for (const entry of response.data ?? []) {
      const value = entry.total_value?.value;
      if (typeof value === "number") out[entry.name] = value;
    }
    return out;
  } catch {
    return {};
  }
}

async function syncAccountMetrics(since: string, until: string) {
  const byDate: AccountMetricsByDate = new Map();

  for (const column of SERIES_METRICS) {
    const response = await fetchSeriesMetric(column, since, until);
    mergeAccountMetricEntry(byDate, column, response?.data?.[0]);
  }

  // Only for the days the series half actually produced — no point asking
  // about a day Instagram has not aggregated yet.
  for (const date of [...byDate.keys()]) {
    const totals = await fetchTotalValuesForDay(date);
    const row = byDate.get(date) ?? {};
    for (const metric of TOTAL_VALUE_METRICS) {
      const value = totals[metric];
      if (typeof value === "number") row[metric] = value;
    }
    byDate.set(date, row);
  }

  // followers_count lives on the account node itself, not the insights
  // edge, and is a single current value rather than a daily series.
  let followersCount: number | null = null;
  try {
    const account = await igGet<{ followers_count?: number }>("", { fields: "followers_count" });
    followersCount = toNum(account.followers_count);
  } catch {
    followersCount = null;
  }

  const rows = buildDailyMetricRows(IG_ACCOUNT_ID, byDate, followersCount);
  if (rows.length === 0) return 0;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("ig_daily_metrics").upsert(rows, { onConflict: "ig_account_id,date" });
  if (error) throw new Error(error.message);
  return rows.length;
}

type MediaListItem = {
  id: string;
  media_type?: string;
  caption?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
};

type MediaListResponse = {
  data: MediaListItem[];
  paging?: { cursors?: { after?: string } };
};

/**
 * Pages through /media via `paging.cursors.after`, never `paging.next` —
 * that URL points at Meta's own domain and would bypass the gateway's
 * Bearer auth, returning 401 MISSING_BEARER.
 */
async function fetchAllMedia(): Promise<MediaListItem[]> {
  const items: MediaListItem[] = [];
  let after: string | undefined;

  for (;;) {
    const params: Record<string, string> = { fields: MEDIA_FIELDS };
    if (after) params.after = after;
    const page = await igGet<MediaListResponse>("media", params);
    items.push(...page.data);

    const next = page.paging?.cursors?.after;
    if (!next || page.data.length === 0) return items;
    after = next;
  }
}

async function fetchOneMediaInsights(mediaId: string) {
  try {
    // igGetNode, not igGet: a post's insights hang off the MEDIA node, and
    // igGet would prefix the account id and 404.
    const response = await igGetNode<IgInsightsResponse>(`${mediaId}/insights`, { metric: MEDIA_INSIGHTS_METRICS });
    return parseMediaInsights(response.data);
  } catch {
    // Some metrics 400 on some media types (e.g. saved/shares on certain
    // formats); one post's insights failing must not drop its metadata row.
    return null;
  }
}

async function syncMedia() {
  const items = await fetchAllMedia();
  const supabase = supabaseAdmin();
  let synced = 0;

  for (const item of items) {
    const metrics = await fetchOneMediaInsights(item.id);

    await supabase.from("ig_media").upsert(
      {
        ig_account_id: IG_ACCOUNT_ID,
        media_id: item.id,
        media_type: item.media_type ?? null,
        caption: item.caption ?? null,
        permalink: item.permalink ?? null,
        thumbnail_url: item.thumbnail_url ?? null,
        posted_at: item.timestamp ?? null,
        views: metrics?.views ?? null,
        reach: metrics?.reach ?? null,
        likes: metrics?.likes ?? null,
        comments_count: metrics?.comments ?? null,
        saved: metrics?.saved ?? null,
        shares: metrics?.shares ?? null,
        // Only stamped when insights actually came back — a failed fetch
        // should look "not yet synced", not "synced with no metrics".
        metrics_synced_at: metrics ? new Date().toISOString() : null,
      },
      { onConflict: "ig_account_id,media_id" }
    );
    synced++;
  }

  return synced;
}

/**
 * Re-syncs the trailing window of account metrics plus all media and their
 * insights. Called from /api/cron/instagram-sync. Safe to call repeatedly —
 * every write is an upsert keyed on (account, date) or (account, media_id).
 */
export async function syncInstagramInsights() {
  if (!isInstagramConfigured()) {
    return { synced: false, reason: "Instagram is not configured" };
  }

  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (TRAILING_WINDOW_DAYS - 1));

  const [dailyRows, mediaCount] = await Promise.all([syncAccountMetrics(isoDate(since), isoDate(until)), syncMedia()]);

  return { synced: true, dailyRows, mediaCount };
}
