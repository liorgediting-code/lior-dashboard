import "server-only";
import type { MetaClient, MetaAdInsight, MetaCampaignStatus } from "./types";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Meta's ad account ids are written both ways in the wild — Ads Manager shows
 * a bare number, the Graph API only accepts `act_`-prefixed ones. Operators
 * paste whichever they were looking at, and an unprefixed id fails with a
 * generic "Unsupported get request" that reads exactly like a permissions
 * problem, so normalising here saves a very confusing debugging session.
 */
export function normalizeAdAccountId(adAccountId: string): string {
  const trimmed = adAccountId.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

type ActionRow = { action_type: string; value: string };

function actionValue(rows: ActionRow[] | undefined, ...types: string[]): number {
  if (!rows) return 0;
  for (const type of types) {
    const match = rows.find((row) => row.action_type === type);
    if (match) return Number(match.value) || 0;
  }
  return 0;
}

/** The video breakdown fields all arrive as a one-element action array rather than a scalar. */
function videoValue(rows: ActionRow[] | undefined): number {
  return rows?.reduce((sum, row) => sum + (Number(row.value) || 0), 0) ?? 0;
}

const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "reach",
  "actions",
  "action_values",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
].join(",");

/**
 * Real Meta Marketing API client, against Graph v21.
 *
 * Needs a system-user token (set on /settings) whose system user is assigned
 * to the ad account — a token with ads_read in its scopes is NOT enough on
 * its own, and an unassigned account answers "(#200) Ad account owner has NOT
 * grant ads_management or ads_read permission" no matter how the token was
 * minted. See lib/meta/mock-client.ts for local/demo use (selected
 * automatically when META_USE_MOCK is not "false").
 */
export class RealMetaClient implements MetaClient {
  async fetchDailyInsights(adAccountId: string, accessToken: string, since: string, until: string): Promise<MetaAdInsight[]> {
    const account = normalizeAdAccountId(adAccountId);
    const params = new URLSearchParams({
      access_token: accessToken,
      level: "ad",
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      fields: INSIGHT_FIELDS,
      limit: "500",
    });

    // Paged for the same reason campaign statuses are: a month of daily rows
    // for an account with a dozen ads runs well past Meta's default page,
    // and a silently truncated first page would understate spend.
    let url: string | null = `${GRAPH_BASE}/${account}/insights?${params.toString()}`;
    const insights: MetaAdInsight[] = [];

    while (url) {
      const res: Response = await fetch(url);
      if (!res.ok) throw new Error(`Meta insights fetch failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: Array<Record<string, unknown>>; paging?: { next?: string } };

      for (const row of json.data) {
        const actions = row.actions as ActionRow[] | undefined;
        const actionValues = row.action_values as ActionRow[] | undefined;

        insights.push({
          adId: row.ad_id as string,
          adName: row.ad_name as string,
          adsetId: row.adset_id as string,
          adsetName: row.adset_name as string,
          campaignId: row.campaign_id as string,
          campaignName: row.campaign_name as string,
          date: row.date_start as string,
          spend: Number(row.spend ?? 0),
          // A lead-gen campaign's result is a lead; a click-to-WhatsApp/Messenger
          // campaign has no lead action at all — its result is a conversation started.
          leads: actionValue(actions, "lead", "onsite_conversion.lead_grouped", "onsite_conversion.messaging_conversation_started_7d"),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          reach: Number(row.reach ?? 0),
          linkClicks: Number(row.inline_link_clicks ?? 0),
          // "video_view" IS the 3-second view in Meta's action taxonomy.
          threeSecVideoViews: actionValue(actions, "video_view"),
          video50Watched: videoValue(row.video_p50_watched_actions as ActionRow[] | undefined),
          video75Watched: videoValue(row.video_p75_watched_actions as ActionRow[] | undefined),
          videoCompleted: videoValue(row.video_p100_watched_actions as ActionRow[] | undefined),
          purchases: actionValue(actions, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"),
          addToCart: actionValue(actions, "add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"),
          revenue: actionValue(actionValues, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"),
        });
      }

      url = json.paging?.next ?? null;
    }

    return insights;
  }

  /**
   * Paged deliberately: an account with more than 25 campaigns (Meta's
   * default page size) would otherwise silently report only the first page,
   * and every campaign missing from the response keeps whatever status it
   * was last synced with — which is exactly the stale-ACTIVE bug this method
   * exists to fix.
   */
  async fetchCampaignStatuses(adAccountId: string, accessToken: string): Promise<MetaCampaignStatus[]> {
    const account = normalizeAdAccountId(adAccountId);
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,effective_status",
      limit: "100",
    });

    let url: string | null = `${GRAPH_BASE}/${account}/campaigns?${params.toString()}`;
    const statuses: MetaCampaignStatus[] = [];

    while (url) {
      const res: Response = await fetch(url);
      if (!res.ok) throw new Error(`Meta campaigns fetch failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as {
        data: Array<Record<string, unknown>>;
        paging?: { next?: string };
      };

      for (const row of json.data) {
        statuses.push({
          campaignId: row.id as string,
          name: row.name as string,
          status: (row.effective_status as string | undefined) ?? "UNKNOWN",
        });
      }

      url = json.paging?.next ?? null;
    }

    return statuses;
  }
}
