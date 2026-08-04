import "server-only";
import type { MetaClient, MetaAdInsight, MetaTokenExchangeResult } from "./types";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Real Meta Marketing API client. Correctly shaped against the Graph API,
 * but cannot be exercised end-to-end without META_APP_ID/META_APP_SECRET
 * and a real ad account — see lib/meta/mock-client.ts for local/demo use
 * (selected automatically when META_USE_MOCK=true).
 */
export class RealMetaClient implements MetaClient {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly redirectUri: string
  ) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      scope: "ads_read,ads_management,business_management",
    });
    return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<MetaTokenExchangeResult> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
    if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { access_token: string };

    // Ad account selection happens via a follow-up "me/adaccounts" call in
    // the real OAuth callback route once there's a token to use.
    const accountsRes = await fetch(
      `${GRAPH_BASE}/me/adaccounts?access_token=${encodeURIComponent(data.access_token)}`
    );
    const accounts = (await accountsRes.json()) as { data?: Array<{ id: string }> };
    const adAccountId = accounts.data?.[0]?.id ?? "";

    return { accessToken: data.access_token, adAccountId };
  }

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
