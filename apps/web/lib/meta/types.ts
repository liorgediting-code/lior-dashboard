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

export interface MetaClient {
  /** Daily spend/leads/impressions/clicks per ad, for the daily cron sync. */
  fetchDailyInsights(adAccountId: string, accessToken: string, since: string, until: string): Promise<MetaAdInsight[]>;
}
