import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ad, AdSet, Campaign, Database, DiagnosticThresholds } from "@dashboard-lior/shared";
import type { DateRange } from "@/lib/metrics/campaign-stats";
import { accountBaseline, aggregateByBucket, toDiagnosticInput, type DiagnosticMetricRow, type FunnelTotals } from "./aggregate";
import { evaluateCampaign, type AccountBaseline, type DiagnosticResult } from "./engine";
import { resolveThresholds } from "./thresholds";
import type { Thresholds } from "./rules";

type Supabase = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

/** The columns the ruleset reads. Selected by name so a widened table does not quietly grow every page's payload. */
const METRIC_COLUMNS = "ad_id,date,spend,leads,impressions,clicks,reach,link_clicks,three_sec_video_views,video_50_watched,purchases";

export type CampaignDiagnosis = {
  campaign: Campaign;
  clientName: string;
  result: DiagnosticResult;
  /** Per-ad verdicts under this campaign, so the deep view can point at the ad that is actually dragging. */
  ads: Array<{ ad: Ad; adsetName: string; result: DiagnosticResult }>;
  /** The thresholds this campaign was judged against, for the UI to show alongside the numbers. */
  thresholds: Thresholds;
  baseline: AccountBaseline;
};

/**
 * Pages through ad_metrics_daily for the same reason lib/metrics/fetch-stats.ts
 * does: Supabase caps responses at max-rows (1,000) and returns a short list
 * silently, which here would not merely understate a number but change which
 * diagnosis fires.
 */
async function fetchMetricRows(supabase: Supabase, adIds: string[], range: DateRange): Promise<DiagnosticMetricRow[]> {
  if (adIds.length === 0) return [];

  const rows: DiagnosticMetricRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ad_metrics_daily")
      .select(METRIC_COLUMNS)
      .in("ad_id", adIds)
      .gte("date", range.since)
      .lte("date", range.until)
      .order("date", { ascending: true })
      .order("ad_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as DiagnosticMetricRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchThresholdRows(supabase: Supabase): Promise<{ global: DiagnosticThresholds | null; byClient: Map<string, DiagnosticThresholds> }> {
  const { data, error } = await supabase.from("diagnostic_thresholds").select("*");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DiagnosticThresholds[];
  return {
    global: rows.find((row) => row.client_id === null) ?? null,
    byClient: new Map(rows.filter((row) => row.client_id !== null).map((row) => [row.client_id as string, row])),
  };
}

/**
 * Diagnoses every campaign in scope — one client's, or the whole agency's.
 *
 * `scope` of "all" is what /ad-analysis renders; a clientId narrows it to the
 * client tab. The baseline is always computed PER CLIENT even in the "all"
 * case: the CPC/CPM rules mean "expensive relative to this advertiser's own
 * account", and blending a ₪90 CPM client with a ₪18 CPM one into a single
 * average would flag the first and excuse the second on nothing but their
 * different niches.
 */
export async function fetchCampaignDiagnoses(
  supabase: Supabase,
  scope: "all" | { clientId: string },
  range: DateRange,
  dateRangeLabel: string
): Promise<CampaignDiagnosis[]> {
  const campaignQuery = supabase.from("campaigns").select("*, clients(name)").order("name");
  const { data: campaignRows, error: campaignError } =
    scope === "all" ? await campaignQuery : await campaignQuery.eq("client_id", scope.clientId);
  if (campaignError) throw new Error(campaignError.message);

  const campaigns = ((campaignRows ?? []) as Array<Campaign & { clients: { name: string } | null }>).map(({ clients, ...campaign }) => ({
    campaign: campaign as Campaign,
    clientName: clients?.name ?? "לקוח לא ידוע",
  }));
  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((row) => row.campaign.id);
  const { data: adsetRows } = await supabase.from("adsets").select("*").in("campaign_id", campaignIds);
  const adsets = (adsetRows ?? []) as AdSet[];

  const adsetIds = adsets.map((adset) => adset.id);
  const { data: adRows } = adsetIds.length ? await supabase.from("ads").select("*").in("adset_id", adsetIds) : { data: [] };
  const ads = (adRows ?? []) as Ad[];

  const metrics = await fetchMetricRows(
    supabase,
    ads.map((ad) => ad.id),
    range
  );

  const adsetOfAd = new Map(ads.map((ad) => [ad.id, ad.adset_id]));
  const campaignOfAdset = new Map(adsets.map((adset) => [adset.id, adset.campaign_id]));
  const campaignOfAd = new Map(ads.map((ad) => [ad.id, campaignOfAdset.get(ad.adset_id)]));
  const adsetNameById = new Map(adsets.map((adset) => [adset.id, adset.name]));

  const byCampaign = aggregateByBucket(metrics, (adId) => campaignOfAd.get(adId));
  const byAd = aggregateByBucket(metrics, (adId) => (adsetOfAd.has(adId) ? adId : undefined));

  const { global, byClient } = await fetchThresholdRows(supabase);

  // Per-client baselines, from that client's own campaigns only.
  const totalsByClient = new Map<string, FunnelTotals[]>();
  for (const { campaign } of campaigns) {
    const totals = byCampaign.get(campaign.id);
    if (!totals) continue;
    const list = totalsByClient.get(campaign.client_id) ?? [];
    list.push(totals);
    totalsByClient.set(campaign.client_id, list);
  }
  const baselineByClient = new Map(
    [...totalsByClient].map(([clientId, totals]) => [clientId, accountBaseline(totals)] as const)
  );

  const adsByCampaign = new Map<string, Ad[]>();
  for (const ad of ads) {
    const campaignId = campaignOfAd.get(ad.id);
    if (!campaignId) continue;
    adsByCampaign.set(campaignId, [...(adsByCampaign.get(campaignId) ?? []), ad]);
  }

  return campaigns.map(({ campaign, clientName }) => {
    const thresholds = resolveThresholds(global, byClient.get(campaign.client_id) ?? null);
    const baseline = baselineByClient.get(campaign.client_id) ?? { avgCpc: null, avgCpm: null };
    const options = {
      dateRangeLabel,
      targetCpa: campaign.target_cpa === null || campaign.target_cpa === undefined ? null : Number(campaign.target_cpa),
      conversionGoal: campaign.conversion_goal ?? ("leads" as const),
    };

    const totals = byCampaign.get(campaign.id);
    const result = evaluateCampaign(
      toDiagnosticInput(campaign.id, campaign.name, totals ?? zeroTotals(), options),
      thresholds,
      baseline
    );

    const adResults = (adsByCampaign.get(campaign.id) ?? [])
      .map((ad) => ({
        ad,
        adsetName: adsetNameById.get(ad.adset_id) ?? "",
        result: evaluateCampaign(toDiagnosticInput(ad.id, ad.name, byAd.get(ad.id) ?? zeroTotals(), options), thresholds, baseline),
      }))
      // Biggest spender first: that is the ad whose diagnosis is worth acting
      // on, and a campaign can carry a long tail of ads that never got budget.
      .sort((a, b) => b.result.metrics.spend - a.result.metrics.spend);

    return { campaign, clientName, result, ads: adResults, thresholds, baseline };
  });
}

function zeroTotals(): FunnelTotals {
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
