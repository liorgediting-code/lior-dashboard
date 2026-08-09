import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, Database } from "@dashboard-lior/shared";

/**
 * Resolves each lead's source_ad_id -> "campaign name › ad name" for
 * display. Only looks up the ads actually referenced by these leads
 * (not every ad for the client), so this stays cheap even for clients
 * with a large ad account. Leads without a source_ad_id (created
 * manually, or via the generic automation webhook, which doesn't know
 * about ads) aren't in the returned map — callers should fall back to
 * "ידני" for those.
 */
export async function resolveLeadSources(
  supabase: SupabaseClient<Database>,
  leads: Pick<Lead, "source_ad_id">[]
): Promise<Record<string, string>> {
  const adIds = [...new Set(leads.map((l) => l.source_ad_id).filter((id): id is string => !!id))];
  if (adIds.length === 0) return {};

  const { data: ads } = await supabase.from("ads").select("id, name, adset_id").in("id", adIds);
  const adsetIds = [...new Set((ads ?? []).map((a) => a.adset_id as string))];
  if (adsetIds.length === 0) return {};

  const { data: adsets } = await supabase.from("adsets").select("id, name, campaign_id").in("id", adsetIds);
  const campaignIds = [...new Set((adsets ?? []).map((a) => a.campaign_id as string))];
  if (campaignIds.length === 0) return {};

  const { data: campaigns } = await supabase.from("campaigns").select("id, name").in("id", campaignIds);

  const campaignNameById = new Map((campaigns ?? []).map((c) => [c.id as string, c.name as string]));
  const campaignIdByAdsetId = new Map((adsets ?? []).map((a) => [a.id as string, a.campaign_id as string]));

  const labelByAdId: Record<string, string> = {};
  for (const ad of ads ?? []) {
    const campaignId = campaignIdByAdsetId.get(ad.adset_id as string);
    const campaignName = campaignId ? campaignNameById.get(campaignId) : undefined;
    labelByAdId[ad.id as string] = campaignName ? `${campaignName} › ${ad.name as string}` : (ad.name as string);
  }
  return labelByAdId;
}
