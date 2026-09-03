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
  /** all_clicks: link clicks, likes, comments, profile taps — everything. */
  clicks: number;
  /** People reached on this date. Not additive across dates — see AdMetricDaily. */
  reach: number;
  /** Link clicks alone (`inline_link_clicks`), which is what every CTR/CPC rule wants. */
  linkClicks: number;
  /**
   * 3-second video views. Meta reports these as the `video_view` action type
   * inside `actions` — the old dedicated `video_3_sec_watched_actions` field
   * was removed and is rejected outright by v21. Note that
   * `video_play_actions` is a DIFFERENT and much larger number (every play
   * start, including sub-3-second scroll-bys), so using it here would inflate
   * hook rate several-fold.
   */
  threeSecVideoViews: number;
  video50Watched: number;
  video75Watched: number;
  videoCompleted: number;
  purchases: number;
  addToCart: number;
  revenue: number;
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
