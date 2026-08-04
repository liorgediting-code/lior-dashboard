import { z } from "zod";
import { getSupabaseClient } from "../supabase-client.js";

export const getCampaignPerformanceSchema = {
  client_id: z.string().uuid(),
  since: z.string().optional().describe("YYYY-MM-DD, defaults to 30 days ago"),
  until: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
};

export async function getCampaignPerformance({
  client_id,
  since,
  until,
}: {
  client_id: string;
  since?: string;
  until?: string;
}) {
  const supabase = getSupabaseClient();
  const sinceDate = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const untilDate = until ?? new Date().toISOString().slice(0, 10);

  const { data: campaigns } = await supabase.from("campaigns").select("id, name, funnel_stage, status").eq("client_id", client_id);
  const campaignIds = (campaigns ?? []).map((c) => c.id as string);
  if (campaignIds.length === 0) return { since: sinceDate, until: untilDate, campaigns: [] };

  const { data: adsets } = await supabase.from("adsets").select("id, campaign_id, name").in("campaign_id", campaignIds);
  const adsetIds = (adsets ?? []).map((a) => a.id as string);

  const { data: ads } = adsetIds.length
    ? await supabase.from("ads").select("id, adset_id, name").in("adset_id", adsetIds)
    : { data: [] as Array<{ id: string; adset_id: string; name: string }> };
  const adIds = (ads ?? []).map((a) => a.id as string);

  const { data: metrics } = adIds.length
    ? await supabase.from("ad_metrics_daily").select("ad_id, spend, leads").in("ad_id", adIds).gte("date", sinceDate).lte("date", untilDate)
    : { data: [] as Array<{ ad_id: string; spend: number; leads: number }> };

  const totalsByAd = new Map<string, { spend: number; leads: number }>();
  for (const m of metrics ?? []) {
    const cur = totalsByAd.get(m.ad_id as string) ?? { spend: 0, leads: 0 };
    cur.spend += Number(m.spend);
    cur.leads += Number(m.leads);
    totalsByAd.set(m.ad_id as string, cur);
  }

  const result = (campaigns ?? []).map((campaign) => ({
    ...campaign,
    adsets: (adsets ?? [])
      .filter((a) => a.campaign_id === campaign.id)
      .map((adset) => ({
        ...adset,
        ads: (ads ?? [])
          .filter((ad) => ad.adset_id === adset.id)
          .map((ad) => {
            const totals = totalsByAd.get(ad.id as string) ?? { spend: 0, leads: 0 };
            return { ...ad, spend: totals.spend, leads: totals.leads, cpl: totals.leads > 0 ? totals.spend / totals.leads : null };
          }),
      })),
  }));

  return { since: sinceDate, until: untilDate, campaigns: result };
}
