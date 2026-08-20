import "server-only";
import type { MetaClient, MetaAdInsight, MetaCampaignStatus } from "./types";

/** Deterministic pseudo-random generator so demo runs are reproducible. */
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

/**
 * Two campaigns, one ACTIVE and one PAUSED, on purpose: with a single
 * always-active campaign the active/inactive filter on /campaigns has
 * nothing to filter and reads as broken in the default demo
 * (META_USE_MOCK defaults to true).
 */
//
// The first entry keeps its ORIGINAL adset/ad meta ids. Those are the
// lookup keys in findOrCreateAdset/findOrCreateAd, so renaming them would
// create a second adset and ad under the same campaign in any DB that was
// ever mock-synced — and fetchCampaignStats sums every ad under a campaign,
// so the overlapping lookback days would be counted twice.
const MOCK_CAMPAIGNS = [
  {
    campaignId: "mock-campaign-1",
    name: "קמפיין לדוגמה",
    status: "ACTIVE",
    adsetId: "mock-adset-1",
    adsetName: "סט לדוגמה",
    adId: "mock-ad-1",
    adName: "מודעה לדוגמה 1",
  },
  {
    campaignId: "mock-campaign-2",
    name: "קמפיין לדוגמה — מושהה",
    status: "PAUSED",
    adsetId: "mock-adset-2",
    adsetName: "סט מושהה",
    adId: "mock-ad-2",
    adName: "מודעה לדוגמה 2",
  },
];

/** Lets the whole app be demoed end-to-end without a real Meta App. */
export class MockMetaClient implements MetaClient {
  async fetchDailyInsights(adAccountId: string, _accessToken: string, since: string, until: string): Promise<MetaAdInsight[]> {
    const rand = seededRandom(adAccountId + since + until);
    const days: string[] = [];
    for (let d = new Date(since); d <= new Date(until); d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }

    const insights: MetaAdInsight[] = [];
    for (const date of days) {
      for (const campaign of MOCK_CAMPAIGNS) {
        // A paused campaign still has history — it just stopped spending
        // recently. Zeroing it entirely would make the inactive row look
        // like a bug rather than a paused campaign.
        const paused = campaign.status !== "ACTIVE";
        insights.push({
          adId: campaign.adId,
          adName: campaign.adName,
          adsetId: campaign.adsetId,
          adsetName: campaign.adsetName,
          campaignId: campaign.campaignId,
          campaignName: campaign.name,
          date,
          spend: Math.round(rand() * (paused ? 40 : 150)),
          leads: Math.round(rand() * (paused ? 2 : 5)),
          impressions: Math.round(rand() * (paused ? 1200 : 5000)),
          clicks: Math.round(rand() * (paused ? 25 : 100)),
        });
      }
    }
    return insights;
  }

  async fetchCampaignStatuses(_adAccountId: string, _accessToken: string): Promise<MetaCampaignStatus[]> {
    return MOCK_CAMPAIGNS.map(({ campaignId, name, status }) => ({ campaignId, name, status }));
  }
}
