import "server-only";

/**
 * Instagram Graph API access, proxied through hookmyapp's Meta gateway.
 *
 * We deliberately do NOT own a Meta app. hookmyapp already holds the
 * connection to the agency's Instagram account and exposes a Graph-shaped
 * proxy, so this file speaks ordinary Graph API and only the base URL and
 * the auth style differ from Meta's own endpoint:
 *
 *   - base URL comes from INSTAGRAM_GRAPH_API_URL
 *     (https://gateway.hookmyapp.com/meta/v25.0)
 *   - auth is `Authorization: Bearer <token>`, NOT the `access_token` query
 *     parameter Meta accepts. Passing the token as a query param returns
 *     401 MISSING_BEARER — this is the single most likely thing to get
 *     wrong when copying a Graph API snippet from Meta's docs.
 *
 * Credentials come from `hookmyapp channels env <channel-id>`.
 */

const BASE = process.env.INSTAGRAM_GRAPH_API_URL;
const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

/** The Instagram user id used in URL paths, e.g. /{id}/media. */
export const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID ?? "";

export class InstagramNotConfiguredError extends Error {
  constructor() {
    super(
      "Instagram is not configured. Run `hookmyapp channels env <channel-id>` " +
        "and add INSTAGRAM_GRAPH_API_URL, INSTAGRAM_ACCOUNT_ID and " +
        "INSTAGRAM_ACCESS_TOKEN to apps/web/.env.local."
    );
    this.name = "InstagramNotConfiguredError";
  }
}

export function isInstagramConfigured(): boolean {
  return Boolean(BASE && TOKEN && IG_ACCOUNT_ID);
}

/**
 * GET a Graph path and return the parsed body.
 *
 * `path` is relative to the account, e.g. "media" or `${mediaId}/insights`,
 * or an empty string for the account node itself.
 */
export async function igGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!BASE || !TOKEN || !IG_ACCOUNT_ID) throw new InstagramNotConfiguredError();
  const suffix = path ? `/${path}` : "";
  return igGetNode<T>(`${IG_ACCOUNT_ID}${suffix}`, params);
}

/**
 * GET any Graph node by its own id, NOT relative to the account.
 *
 * Media insights live at `/{media-id}/insights`. Reaching them through
 * `igGet` produces `/{account-id}/{media-id}/insights`, which 404s — and
 * because the caller wrapped it in a try/catch, every post's metrics
 * silently came back null instead of failing loudly. Hence the separate,
 * explicitly-named entry point.
 */
export async function igGetNode<T>(nodePath: string, params: Record<string, string> = {}): Promise<T> {
  if (!BASE || !TOKEN) throw new InstagramNotConfiguredError();

  const query = new URLSearchParams(params).toString();
  const url = `${BASE}/${nodePath}${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    // Metrics are synced on a cron and read from our own tables; never let
    // Next's fetch cache serve a stale Graph response into a sync run.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Instagram API ${res.status} on ${nodePath}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** A single metric as the Graph insights edge returns it. */
export type IgInsightValue = { value: number; end_time?: string };

export type IgInsightEntry = {
  name: string;
  period?: string;
  values: IgInsightValue[];
};

/**
 * Insights responses carry `title`/`description` in whatever locale the
 * gateway's Meta app is set to — observed to come back in Dutch. Never
 * render those fields; label metrics with our own Hebrew strings.
 */
export type IgInsightsResponse = {
  data: IgInsightEntry[];
};
