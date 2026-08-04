import "server-only";
import type { MetaClient, MetaAdInsight, MetaTokenExchangeResult } from "./types";

/** Deterministic pseudo-random generator so demo runs are reproducible. */
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

/** Lets the whole app be demoed end-to-end without a real Meta App. */
export class MockMetaClient implements MetaClient {
  getAuthorizationUrl(state: string): string {
    return `/api/meta/oauth/callback?code=mock-code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(): Promise<MetaTokenExchangeResult> {
    return { accessToken: "mock-access-token", adAccountId: "act_mock123" };
  }

  async fetchDailyInsights(adAccountId: string, _accessToken: string, since: string, until: string): Promise<MetaAdInsight[]> {
    const rand = seededRandom(adAccountId + since + until);
    const days: string[] = [];
    for (let d = new Date(since); d <= new Date(until); d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }

    const insights: MetaAdInsight[] = [];
    for (const date of days) {
      insights.push({
        adId: "mock-ad-1",
        adName: "מודעה לדוגמה 1",
        adsetId: "mock-adset-1",
        adsetName: "סט לדוגמה",
        campaignId: "mock-campaign-1",
        campaignName: "קמפיין לדוגמה",
        date,
        spend: Math.round(rand() * 150),
        leads: Math.round(rand() * 5),
        impressions: Math.round(rand() * 5000),
        clicks: Math.round(rand() * 100),
      });
    }
    return insights;
  }
}
