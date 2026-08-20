import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dashboard-lior/shared";
import type { CrmDashboardCampaign } from "@/components/campaign-crm-dashboard";
import { trailingDays } from "./campaign-stats";
import { fetchCampaignsPinnedToCrm, fetchCampaignStats } from "./fetch-stats";

/** The window every CRM campaign dashboard reports on. */
export const CRM_CAMPAIGN_WINDOW_DAYS = 30;

/**
 * Rows for <CampaignCrmDashboard>, for whichever CRM is asking. One helper
 * for all three surfaces (agency CRM, client tab, client portal) so they
 * can't drift apart on the window or on which campaigns count.
 */
export async function fetchCrmCampaignDashboard(
  supabase: SupabaseClient<Database>,
  target: "agency" | { clientId: string }
): Promise<CrmDashboardCampaign[]> {
  const campaigns = await fetchCampaignsPinnedToCrm(supabase, target);
  if (campaigns.length === 0) return [];

  const stats = await fetchCampaignStats(
    supabase,
    campaigns.map((campaign) => campaign.id),
    trailingDays(CRM_CAMPAIGN_WINDOW_DAYS)
  );

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    clientName: campaign.clientName,
    status: campaign.status,
    funnelStage: campaign.funnel_stage,
    stats: stats.byCampaign(campaign.id),
  }));
}
