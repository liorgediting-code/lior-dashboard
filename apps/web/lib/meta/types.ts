export interface MetaAdInsight {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  date: string; // YYYY-MM-DD
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
}

/**
 * The insights edge does NOT carry a status field, so delivery state needs
 * its own request against the /campaigns edge. Without it every synced
 * campaign would read ACTIVE forever and the "not active" filter on
 * /campaigns would be permanently empty.
 */
export interface MetaCampaignStatus {
  campaignId: string;
  name: string;
  /** Meta's `effective_status`, verbatim — ACTIVE / PAUSED / ARCHIVED / … */
  status: string;
}

export interface MetaClient {
  /** Daily spend/leads/impressions/clicks per ad, for the daily cron sync. */
  fetchDailyInsights(adAccountId: string, accessToken: string, since: string, until: string): Promise<MetaAdInsight[]>;
  /** Current delivery status of every campaign on the account. */
  fetchCampaignStatuses(adAccountId: string, accessToken: string): Promise<MetaCampaignStatus[]>;
}
