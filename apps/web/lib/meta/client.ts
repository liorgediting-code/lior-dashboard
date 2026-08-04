import "server-only";
import type { MetaClient, MetaAdInsight } from "./types";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Real Meta Marketing API client. Correctly shaped against the Graph API,
 * but cannot be exercised end-to-end without a system-level access token
 * (set on /settings) and a real ad account — see lib/meta/mock-client.ts
 * for local/demo use (selected automatically when META_USE_MOCK=true).
 */
export class RealMetaClient implements MetaClient {
  async fetchDailyInsights(
    adAccountId: string,
    accessToken: string,
    since: string,
    until: string
  ): Promise<MetaAdInsight[]> {
    const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,actions,impressions,clicks";
    const params = new URLSearchParams({
      access_token: accessToken,
      level: "ad",
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      fields,
    });
    const res = await fetch(`${GRAPH_BASE}/${adAccountId}/insights?${params.toString()}`);
    if (!res.ok) throw new Error(`Meta insights fetch failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };

    return json.data.map((row) => {
      const actions = (row.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
      const leadAction = actions.find((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      return {
        adId: row.ad_id as string,
        adName: row.ad_name as string,
        adsetId: row.adset_id as string,
        adsetName: row.adset_name as string,
        campaignId: row.campaign_id as string,
        campaignName: row.campaign_name as string,
        date: row.date_start as string,
        spend: Number(row.spend ?? 0),
        leads: Number(leadAction?.value ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
      };
    });
  }
}
