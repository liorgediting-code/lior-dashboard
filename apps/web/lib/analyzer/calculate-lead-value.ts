import { CONSERVATIVE_CLOSE_RATE_PCT } from "./thresholds";

export type LeadValueRoute = "A" | "B" | "C";

export interface LeadValueInput {
  /** Route A: real per-deal data. */
  dealPriceAvg?: number | null;
  closeRatePct?: number | null; // 0-100 scale
  /** Route B: revenue/deals data + a business-type close-rate estimate. */
  monthlyRevenue?: number | null;
  dealsPerMonth?: number | null;
  estimatedCloseRatePct?: number | null; // 0-100 scale, from business_type_benchmarks
  /** Route C: no data at all, fall back to the low end of the price range. */
  priceRangeLow?: number | null;
  conservativeCloseRatePct?: number; // 0-100 scale, defaults to CONSERVATIVE_CLOSE_RATE_PCT
}

export interface LeadValueResult {
  value: number;
  route: LeadValueRoute;
}

/**
 * lead_value =
 *   route A: deal_price_avg * close_rate_pct        (real data available)
 *   route B: (monthly_revenue / deals_per_month) * estimated_close_rate
 *   route C: price_range_low * conservative_close_rate
 *
 * Returns null only when there isn't even enough data for route C.
 */
export function calculateLeadValue(input: LeadValueInput): LeadValueResult | null {
  if (input.dealPriceAvg != null && input.closeRatePct != null) {
    return { value: input.dealPriceAvg * (input.closeRatePct / 100), route: "A" };
  }

  if (
    input.monthlyRevenue != null &&
    input.dealsPerMonth != null &&
    input.dealsPerMonth > 0 &&
    input.estimatedCloseRatePct != null
  ) {
    const avgDealValue = input.monthlyRevenue / input.dealsPerMonth;
    return { value: avgDealValue * (input.estimatedCloseRatePct / 100), route: "B" };
  }

  if (input.priceRangeLow != null) {
    const conservative = input.conservativeCloseRatePct ?? CONSERVATIVE_CLOSE_RATE_PCT;
    return { value: input.priceRangeLow * (conservative / 100), route: "C" };
  }

  return null;
}
