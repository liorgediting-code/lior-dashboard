import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ad, AdMetricDaily, AdSet, Campaign, Database } from "@dashboard-lior/shared";
import { deriveStats, groupTotals, statsFor, sumTotals, type CampaignStats, type DateRange, type MetricTotals } from "./campaign-stats";

type Supabase = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

/**
 * Walks campaigns → adsets → ads and rolls ad_metrics_daily up to each level.
 *
 * Every page that shows campaign numbers used to do this walk inline; it now
 * lives here so the funnel dashboard, the campaigns tab and the client report
 * can't drift apart on which window or which rows they count.
 */
export type CampaignStatsResult = {
  adsets: AdSet[];
  ads: Ad[];
  byCampaign: (campaignId: string) => CampaignStats;
  byAdset: (adsetId: string) => CampaignStats;
  byAd: (adId: string) => CampaignStats;
  /** Totals across every campaign passed in. */
  overall: CampaignStats;
};

export async function fetchCampaignsForClient(supabase: Supabase, clientId: string): Promise<Campaign[]> {
  const { data } = await supabase.from("campaigns").select("*").eq("client_id", clientId).order("name");
  return (data ?? []) as Campaign[];
}

/** A campaign plus the name of the client it belongs to, for the cross-client list. */
export type CampaignWithClient = Campaign & { clientName: string };

/**
 * Every campaign across every client, for /campaigns. Embeds the client name
 * in the same round trip rather than issuing a second query and joining in
 * memory — `campaigns` declares its client FK in database.types.ts precisely
 * so postgrest-js can type this.
 */
export async function fetchAllCampaigns(supabase: Supabase): Promise<CampaignWithClient[]> {
  const { data, error } = await supabase.from("campaigns").select("*, clients(name)").order("name");
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Campaign & { clients: { name: string } | null }>).map(({ clients, ...campaign }) => ({
    ...campaign,
    clientName: clients?.name ?? "לקוח לא ידוע",
  }));
}

/**
 * The campaigns pinned onto one CRM surface. `agency` reads the flag across
 * all clients; a clientId reads that client's flag only — the client portal
 * must never see another client's campaigns even by accident.
 */
export async function fetchCampaignsPinnedToCrm(supabase: Supabase, target: "agency" | { clientId: string }): Promise<CampaignWithClient[]> {
  const query = supabase.from("campaigns").select("*, clients(name)").order("name");
  const { data, error } =
    target === "agency"
      ? await query.eq("show_in_agency_crm", true)
      : await query.eq("show_in_client_crm", true).eq("client_id", target.clientId);
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Campaign & { clients: { name: string } | null }>).map(({ clients, ...campaign }) => ({
    ...campaign,
    clientName: clients?.name ?? "לקוח לא ידוע",
  }));
}

/**
 * Pages through ad_metrics_daily rather than issuing one unbounded select:
 * Supabase caps API responses at max-rows (1,000 by default) and silently
 * returns a short list, which would quietly understate spend in a report a
 * client actually reads.
 */
async function fetchMetricRows(supabase: Supabase, adIds: string[], range: DateRange): Promise<AdMetricDaily[]> {
  if (adIds.length === 0) return [];

  const rows: AdMetricDaily[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ad_metrics_daily")
      .select("*")
      .in("ad_id", adIds)
      .gte("date", range.since)
      .lte("date", range.until)
      .order("date", { ascending: true })
      .order("ad_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as AdMetricDaily[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchCampaignStats(supabase: Supabase, campaignIds: string[], range: DateRange): Promise<CampaignStatsResult> {
  const empty = deriveStats({ spend: 0, leads: 0, impressions: 0, clicks: 0 });
  if (campaignIds.length === 0) {
    return { adsets: [], ads: [], byCampaign: () => empty, byAdset: () => empty, byAd: () => empty, overall: empty };
  }

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

  const campaignOfAdset = new Map(adsets.map((adset) => [adset.id, adset.campaign_id]));
  const adsetOfAd = new Map(ads.map((ad) => [ad.id, ad.adset_id]));
  const campaignOfAd = new Map(ads.map((ad) => [ad.id, campaignOfAdset.get(ad.adset_id)]));

  const byAdTotals = groupTotals(metrics, (adId) => (adsetOfAd.has(adId) ? adId : undefined));
  const byAdsetTotals = groupTotals(metrics, (adId) => adsetOfAd.get(adId));
  const byCampaignTotals = groupTotals(metrics, (adId) => campaignOfAd.get(adId));

  return {
    adsets,
    ads,
    byCampaign: (campaignId) => statsFor(byCampaignTotals, campaignId),
    byAdset: (adsetId) => statsFor(byAdsetTotals, adsetId),
    byAd: (adId) => statsFor(byAdTotals, adId),
    overall: deriveStats(sumTotals(byCampaignTotals.values() as Iterable<MetricTotals>)),
  };
}
