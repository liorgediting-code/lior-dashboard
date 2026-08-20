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
export async function syncClientAdMetrics(clientId: string, lookbackDays = 3) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("meta_ad_account_id").eq("id", clientId).single(),
    supabase.from("app_settings").select("meta_system_user_token").eq("id", 1).maybeSingle(),
  ]);

  const meta = getMetaClient();
  const useMock = process.env.META_USE_MOCK !== "false";
  const adAccountId = useMock ? "act_mock123" : (client?.meta_ad_account_id as string | null);
  const accessToken = useMock ? "mock" : (settings?.meta_system_user_token as string | null);

  if (!adAccountId || !accessToken) {
    return { clientId, synced: 0, skipped: "no Meta connection configured yet" };
  }

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

  let synced = 0;
  for (const insight of insights) {
    const campaignId = await findOrCreateCampaign(clientId, insight.campaignId, insight.campaignName, campaignStatuses);
    const adsetId = await findOrCreateAdset(campaignId, insight.adsetId, insight.adsetName);
    const adId = await findOrCreateAd(adsetId, insight.adId, insight.adName);

    await supabase.from("ad_metrics_daily").upsert(
      {
        ad_id: adId,
        date: insight.date,
        spend: insight.spend,
        leads: insight.leads,
        impressions: insight.impressions,
        clicks: insight.clicks,
      },
      { onConflict: "ad_id,date" }
    );
    synced++;
  }

  return { clientId, synced };
}

export async function syncAllClients(lookbackDays = 3) {
  const supabase = supabaseAdmin();
  const { data: clients } = await supabase.from("clients").select("id");
  const results = [];
  for (const client of clients ?? []) {
    results.push(await syncClientAdMetrics(client.id as string, lookbackDays));
  }
  return results;
}
