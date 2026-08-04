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

  cached = new RealMetaClient();
  return cached;
}
