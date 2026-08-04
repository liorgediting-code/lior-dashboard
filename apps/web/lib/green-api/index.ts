import "server-only";
import type { GreenApiClient } from "./types";
import { RealGreenApiClient } from "./client";
import { MockGreenApiClient } from "./mock-client";

export * from "./types";

let cached: GreenApiClient | null = null;

export function getGreenApiClient(): GreenApiClient {
  if (cached) return cached;

  const useMock = process.env.GREEN_API_USE_MOCK !== "false";
  if (useMock) {
    cached = new MockGreenApiClient();
    return cached;
  }

  const token = process.env.GREEN_API_TOKEN;
  if (!token) throw new Error("GREEN_API_USE_MOCK=false requires GREEN_API_TOKEN to be set");
  cached = new RealGreenApiClient(token);
  return cached;
}
