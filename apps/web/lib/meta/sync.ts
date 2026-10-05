import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMetaClient } from "./index";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * `status` is what the /campaigns page filters active/not-active on, so a
 * re-sync must REFRESH it on rows that already exist — a campaign paused in
 * Ads Manager would otherwise stay ACTIVE in our copy forever.
 *
 * `statuses` is the map fetched once per account below, or `null` when that
 * request failed. Null means "we don't know": leave an existing row's status
 * exactly as it was rather than overwriting real data with a guess. A
 * campaign present in insights but absent from a map we DID fetch has been
 * deleted since, and gets UNKNOWN — never a hopeful ACTIVE.
 */
async function findOrCreateCampaign(clientId: string, metaId: string, name: string, statuses: Map<string, string> | null) {
  const supabase = supabaseAdmin();
  const status = statuses?.get(metaId) ?? "UNKNOWN";
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("meta_id", metaId)
    .maybeSingle();

  if (existing) {
    if (statuses && existing.status !== status) {
      await supabase.from("campaigns").update({ status }).eq("id", existing.id as string);
    }
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({ client_id: clientId, meta_id: metaId, name, status })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "failed to create campaign");
  return created.id as string;
}

async function findOrCreateAdset(campaignId: string, metaId: string, name: string) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("adsets").select("id").eq("campaign_id", campaignId).eq("meta_id", metaId).maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("adsets")
    .insert({ campaign_id: campaignId, meta_id: metaId, name, status: "ACTIVE" })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "failed to create adset");
  return created.id as string;
}

async function findOrCreateAd(adsetId: string, metaId: string, name: string) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("ads").select("id").eq("adset_id", adsetId).eq("meta_id", metaId).maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("ads")
    .insert({ adset_id: adsetId, meta_id: metaId, name, status: "ACTIVE" })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "failed to create ad");
  return created.id as string;
}

/**
 * Pulls the last `lookbackDays` of insights for one client and upserts
 * campaigns/adsets/ads/ad_metrics_daily. Called per-client from
 * /api/cron/daily-ad-sync. Works against the mock Meta client out of the
 * box; against the real one once a system-level Meta token is configured
 * on /settings and the client has a `meta_ad_account_id` set.
 */
export async function syncClientAdMetrics(clientId: string, lookbackDays = 3): Promise<{ clientId: string; synced: number; skipped?: string }> {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("meta_ad_account_id, meta_access_token").eq("id", clientId).single(),
    supabase.from("app_settings").select("meta_system_user_token").eq("id", 1).maybeSingle(),
  ]);

  const meta = getMetaClient();
  const useMock = process.env.META_USE_MOCK !== "false";
  const adAccountId = useMock ? "act_mock123" : (client?.meta_ad_account_id as string | null);

  // A client's own token wins over the agency-wide system-user token.
  //
  // Reading an ad account needs the token's system user to be ASSIGNED to
  // that account, which a token with ads_read in its scopes still is not —
  // an unassigned account answers "(#200) Ad account owner has NOT grant
  // ads_management or ads_read permission" regardless. Getting there via
  // Business Manager means the client shares the account with the agency's
  // business as a partner; when they will not or cannot, pasting a token
  // minted inside their OWN business on the client's edit page is the
  // second door, and this is what opens it.
  const clientToken = (client?.meta_access_token as string | null)?.trim() || null;
  const accessToken = useMock ? "mock" : clientToken ?? (settings?.meta_system_user_token as string | null);

  if (!adAccountId) return { clientId, synced: 0, skipped: "לא הוגדר חשבון מודעות (Meta Ad Account ID) ללקוח" };
  if (!accessToken) return { clientId, synced: 0, skipped: "אין טוקן Meta — הגדירו System User Token ב/settings או טוקן ייעודי ללקוח" };

  const since = isoDaysAgo(lookbackDays);
  const until = isoDaysAgo(0);
  const insights = await meta.fetchDailyInsights(adAccountId, accessToken, since, until);

  // One extra request per account, not per insight row: the insights edge
  // carries no status field at all. A failure here must not lose the
  // metrics we already fetched, so it degrades to "leave statuses alone".
  let campaignStatuses: Map<string, string> | null = null;
  try {
    const rows = await meta.fetchCampaignStatuses(adAccountId, accessToken);
    campaignStatuses = new Map(rows.map((row) => [row.campaignId, row.status]));
  } catch {
    campaignStatuses = null;
  }

  // Insights come back one row per ad per DAY, so the same campaign/adset/ad
  // repeats up to `lookbackDays` times. Resolving ids once per entity (not
  // once per row) and upserting metrics in chunks turns thousands of
  // sequential round-trips into a handful — the per-row version made the
  // manual 30-day sync outlast the server action's time limit.
  const campaignIds = new Map<string, string>();
  const adsetIds = new Map<string, string>();
  const adIds = new Map<string, string>();
  const metricRows: Record<string, unknown>[] = [];

  for (const insight of insights) {
    let campaignId = campaignIds.get(insight.campaignId);
    if (!campaignId) {
      campaignId = await findOrCreateCampaign(clientId, insight.campaignId, insight.campaignName, campaignStatuses);
      campaignIds.set(insight.campaignId, campaignId);
    }
    const adsetKey = `${insight.campaignId}:${insight.adsetId}`;
    let adsetId = adsetIds.get(adsetKey);
    if (!adsetId) {
      adsetId = await findOrCreateAdset(campaignId, insight.adsetId, insight.adsetName);
      adsetIds.set(adsetKey, adsetId);
    }
    const adKey = `${adsetKey}:${insight.adId}`;
    let adId = adIds.get(adKey);
    if (!adId) {
      adId = await findOrCreateAd(adsetId, insight.adId, insight.adName);
      adIds.set(adKey, adId);
    }

    metricRows.push({
      ad_id: adId,
      date: insight.date,
      spend: insight.spend,
      leads: insight.leads,
      impressions: insight.impressions,
      clicks: insight.clicks,
      reach: insight.reach,
      link_clicks: insight.linkClicks,
      three_sec_video_views: insight.threeSecVideoViews,
      video_50_watched: insight.video50Watched,
      video_75_watched: insight.video75Watched,
      video_completed: insight.videoCompleted,
      purchases: insight.purchases,
      add_to_cart: insight.addToCart,
      revenue: insight.revenue,
    });
  }

  const UPSERT_CHUNK = 500;
  for (let i = 0; i < metricRows.length; i += UPSERT_CHUNK) {
    const { error } = await supabase
      .from("ad_metrics_daily")
      .upsert(metricRows.slice(i, i + UPSERT_CHUNK) as never, { onConflict: "ad_id,date" });
    if (error) throw new Error(error.message);
  }
  const synced = metricRows.length;

  return { clientId, synced };
}

export type ClientSyncResult = {
  clientId: string;
  clientName: string;
  synced: number;
  skipped?: string;
  error?: string;
};

/**
 * One client's failure must not sink the run. Ad accounts drift out of a
 * Business Manager, tokens get rotated, a single client's account 400s — and
 * with a bare `for` loop that one throw would discard the other nine clients'
 * freshly fetched metrics AND leave the operator with a generic error that
 * names nobody. Each result carries its own outcome instead.
 */
export async function syncAllClients(lookbackDays = 3): Promise<ClientSyncResult[]> {
  const supabase = supabaseAdmin();
  const { data: clients } = await supabase.from("clients").select("id, name");
  const results: ClientSyncResult[] = [];

  for (const client of clients ?? []) {
    const clientId = client.id as string;
    const clientName = (client.name as string) ?? "לקוח";
    try {
      const result = await syncClientAdMetrics(clientId, lookbackDays);
      results.push({ clientId, clientName, synced: result.synced, skipped: result.skipped });
    } catch (err) {
      results.push({ clientId, clientName, synced: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
