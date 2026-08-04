import "server-only";
import type { MetaClient } from "./types";
import { RealMetaClient } from "./client";
import { MockMetaClient } from "./mock-client";

export * from "./types";

let cached: MetaClient | null = null;

/** Selects the real or mock Meta client based on META_USE_MOCK (default true). */
export function getMetaClient(): MetaClient {
  if (cached) return cached;

  const useMock = process.env.META_USE_MOCK !== "false";
  if (useMock) {
    cached = new MockMetaClient();
    return cached;
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error("META_USE_MOCK=false requires META_APP_ID, META_APP_SECRET and META_REDIRECT_URI to be set");
  }

  cached = new RealMetaClient(appId, appSecret, redirectUri);
  return cached;
}
