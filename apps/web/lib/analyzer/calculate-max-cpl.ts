import { DEFAULT_PROFIT_RATIO } from "./thresholds";

/** max_CPL = lead_value / profit_ratio */
export function calculateMaxCpl(leadValue: number, profitRatio: number = DEFAULT_PROFIT_RATIO): number {
  return leadValue / profitRatio;
}
