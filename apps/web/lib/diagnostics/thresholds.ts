import type { DiagnosticThresholds } from "@dashboard-lior/shared";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./rules";

export type ThresholdKeyName = keyof Thresholds;

export const THRESHOLD_KEYS: ThresholdKeyName[] = [
  "hook_rate",
  "hold_rate",
  "ctr_link_click",
  "cpc_account_multiple",
  "landing_page_conversion_rate",
  "frequency",
  "cpm_account_multiple",
  "min_impressions",
  "min_spend",
  "min_days_active",
];

/**
 * Resolves the thresholds one client is judged against: code defaults, then
 * the global row, then the client's own row, each layer overriding only the
 * columns it actually sets.
 *
 * Null means "inherit" rather than "zero" at every layer. That matters: an
 * operator who loosens CTR for one client must not silently freeze that
 * client's other nine thresholds at today's defaults, and a global row that
 * only raises the impression floor must not drag every rate down to 0 —
 * which, for the `higherIsWorse` rules, would fire every one of them on
 * every campaign forever.
 */
export function resolveThresholds(global: DiagnosticThresholds | null, client: DiagnosticThresholds | null): Thresholds {
  const resolved = { ...DEFAULT_THRESHOLDS };

  for (const layer of [global, client]) {
    if (!layer) continue;
    for (const key of THRESHOLD_KEYS) {
      const value = layer[key];
      if (value !== null && value !== undefined) resolved[key] = Number(value);
    }
  }

  return resolved;
}

/** Which of a client's effective thresholds differ from the code defaults, for the UI to mark as customised. */
export function overriddenKeys(effective: Thresholds): ThresholdKeyName[] {
  return THRESHOLD_KEYS.filter((key) => effective[key] !== DEFAULT_THRESHOLDS[key]);
}
