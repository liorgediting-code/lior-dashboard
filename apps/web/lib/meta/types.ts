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

export interface MetaTokenExchangeResult {
  accessToken: string;
  adAccountId: string;
}

export interface MetaClient {
  /** Ad-account-level OAuth authorization URL to redirect the agency owner to. */
  getAuthorizationUrl(state: string): string;
  /** Exchanges the OAuth `code` from the callback for a long-lived access token. */
  exchangeCodeForToken(code: string): Promise<MetaTokenExchangeResult>;
  /** Daily spend/leads/impressions/clicks per ad, for the daily cron sync. */
  fetchDailyInsights(adAccountId: string, accessToken: string, since: string, until: string): Promise<MetaAdInsight[]>;
}
