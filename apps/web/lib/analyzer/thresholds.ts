// Configurable knobs for the deterministic ad analyzer. The spec gives
// ranges ("₪150-200 / 3-5 leads", "₪300-400") rather than single numbers —
// these constants pick the midpoint of each range as the default and are
// the one place to tune if the agency's real-world practice differs.

/** Minimum spend (₪) before a single ad is eligible to be judged KILL. */
export const SINGLE_AD_MIN_SPEND_FOR_KILL = 175;

/** Minimum spend (₪) before a whole ad set with 0 leads is judged KILL. */
export const ADSET_ZERO_LEAD_KILL_SPEND = 350;

/** Close rate (0-100 scale) used for lead-value route C, when there is no
 * client data at all — deliberately conservative per the spec. */
export const CONSERVATIVE_CLOSE_RATE_PCT = 2;

/** Default profit ratio when a client hasn't overridden it. */
export const DEFAULT_PROFIT_RATIO = 5;

/** Minimum real closes in the trailing window before trusting them enough
 * to recalculate a client's max_cpl (spec idea 1). */
export const MIN_CLOSES_FOR_CPL_RECALC = 3;

/** Minimum clients (each with enough real closes) in the same business_type
 * before the shared benchmark table is allowed to switch from the seeded
 * default to a learned average (spec idea 2). */
export const MIN_CLIENTS_FOR_LEARNED_BENCHMARK = 3;

/** Trailing window used for the monthly recalculation job. */
export const CPL_RECALC_WINDOW_DAYS = 90;
