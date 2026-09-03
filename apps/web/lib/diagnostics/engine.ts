import {
  DEFAULT_THRESHOLDS,
  RULES_IN_PRIORITY_ORDER,
  type DiagnosticRule,
  type RecommendedAction,
  type RuleId,
  type Thresholds,
} from "./rules";

/**
 * Evaluates one campaign (or adset, or single ad — the shape is the same) of
 * Meta numbers against the funnel ruleset.
 *
 * Pure: no Supabase, no `server-only`, no clock. Everything time-dependent
 * arrives pre-computed on the input, which is what makes the whole ruleset
 * testable against fixtures instead of against a live ad account.
 */

/** Exactly the Meta Insights fields the ruleset needs, summed over the window. */
export type DiagnosticInput = {
  campaignId: string;
  campaignName: string;
  dateRangeLabel: string;
  impressions: number;
  /**
   * Summed daily reach. Not deduplicated across days, so it is an UPPER
   * bound on true reach — which makes the frequency below a LOWER bound.
   * That asymmetry is deliberate: the fatigue rule can miss real fatigue but
   * can never invent it out of an accounting artefact.
   */
  reach: number;
  spend: number;
  linkClicks: number;
  threeSecVideoViews: number;
  video50Watched: number;
  /** Leads or purchases, whichever this campaign's `conversion_goal` names. */
  conversions: number;
  /** Days in the window on which this campaign actually spent anything. */
  daysActive: number;
  /** Null until an operator sets one — the CPA gate stays silent without it. */
  targetCpa: number | null;
  /** True when the ad has meaningful CTR history and it is trending down over the window. */
  ctrDeclining: boolean;
  /** True when the campaign ran video creative at all; the hook/hold gates are skipped otherwise. */
  hasVideo: boolean;
};

/** Account-wide baselines the two "×N of the account average" rules compare against. */
export type AccountBaseline = {
  /** Null when the account has no spend at all in the window — the CPC/CPM rules then stay silent. */
  avgCpc: number | null;
  avgCpm: number | null;
};

export type Severity = "high" | "medium" | "low";

export type Diagnosis = {
  ruleId: RuleId;
  labelHe: string;
  formulaHe: string;
  diagnosisHe: string;
  recommendedAction: RecommendedAction;
  actionDetailHe: string;
  severity: Severity;
  priority: number;
  /** The measured value, in the rule's own units (a ratio for rates, currency for CPC/CPA). */
  metricValue: number;
  /** The threshold it was measured against, already resolved from multipliers into an absolute number. */
  metricThreshold: number;
  /** How far past the threshold it is, as a fraction: 0.4 = 40% worse than allowed. */
  deviation: number;
};

export type DiagnosticStatus = "bottleneck_found" | "healthy" | "insufficient_data";

export type DiagnosticResult = {
  campaignId: string;
  campaignName: string;
  status: DiagnosticStatus;
  diagnoses: Diagnosis[];
  /** The action to take first: the earliest failing gate. Null when healthy or short of data. */
  primaryBottleneck: RecommendedAction | null;
  primaryRuleId: RuleId | null;
  /** Why the campaign is `insufficient_data`, in Hebrew, for the UI to show instead of a fake verdict. */
  insufficientReasonHe: string | null;
  /** Every funnel rate we could compute, for the UI's funnel strip. Null where the denominator was 0. */
  metrics: FunnelMetrics;
};

export type FunnelMetrics = {
  hookRate: number | null;
  holdRate: number | null;
  ctrLinkClick: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  landingPageConversionRate: number | null;
  cpa: number | null;
  spend: number;
  impressions: number;
  linkClicks: number;
  conversions: number;
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function funnelMetrics(input: DiagnosticInput): FunnelMetrics {
  return {
    hookRate: ratio(input.threeSecVideoViews, input.impressions),
    holdRate: ratio(input.video50Watched, input.threeSecVideoViews),
    ctrLinkClick: ratio(input.linkClicks, input.impressions),
    cpc: ratio(input.spend, input.linkClicks),
    cpm: input.impressions > 0 ? (input.spend / input.impressions) * 1000 : null,
    frequency: ratio(input.impressions, input.reach),
    landingPageConversionRate: ratio(input.conversions, input.linkClicks),
    cpa: ratio(input.spend, input.conversions),
    spend: input.spend,
    impressions: input.impressions,
    linkClicks: input.linkClicks,
    conversions: input.conversions,
  };
}

/**
 * Severity by DISTANCE from the threshold, not by which rule fired: a hook
 * rate of 19.8% against a 20% floor is a rounding error, a hook rate of 6%
 * is a different creative problem entirely, and a boolean cannot tell them
 * apart. `deviation` is the shortfall (or excess) as a fraction of the
 * threshold, so it means the same thing for a rate and for a shekel amount.
 */
export function severityFor(deviation: number): Severity {
  if (deviation >= 0.5) return "high";
  if (deviation >= 0.2) return "medium";
  return "low";
}

function deviationFor(value: number, threshold: number, higherIsWorse: boolean): number {
  if (threshold <= 0) return 0;
  return higherIsWorse ? (value - threshold) / threshold : (threshold - value) / threshold;
}

/**
 * Resolves a rule's threshold into an absolute number in the metric's own
 * units. Two of the rules are expressed as a multiple of the account average
 * rather than a fixed number ("1.5× the account CPC"), because a fixed CPC
 * ceiling is meaningless across niches — and those return null when the
 * account has no baseline yet, which silences the rule rather than
 * comparing against a zero.
 */
function resolveThreshold(rule: DiagnosticRule, thresholds: Thresholds, baseline: AccountBaseline, input: DiagnosticInput): number | null {
  switch (rule.id) {
    case "high_cpc_good_ctr":
      return baseline.avgCpc === null ? null : baseline.avgCpc * thresholds.cpc_account_multiple;
    case "low_cpm_efficiency":
      return baseline.avgCpm === null ? null : baseline.avgCpm * thresholds.cpm_account_multiple;
    case "good_funnel_bad_roas":
      return input.targetCpa;
    default:
      return rule.thresholdKey ? thresholds[rule.thresholdKey] : null;
  }
}

function measuredValue(ruleId: RuleId, metrics: FunnelMetrics): number | null {
  switch (ruleId) {
    case "high_frequency_fatigue":
      return metrics.frequency;
    case "low_hook_rate":
      return metrics.hookRate;
    case "low_cpm_efficiency":
      return metrics.cpm;
    case "low_hold_rate":
      return metrics.holdRate;
    case "low_ctr":
      return metrics.ctrLinkClick;
    case "high_cpc_good_ctr":
      return metrics.cpc;
    case "low_lp_conversion":
      return metrics.landingPageConversionRate;
    case "good_funnel_bad_roas":
      return metrics.cpa;
  }
}

/**
 * Extra conditions from the spec that a single threshold comparison cannot
 * express. Each one exists to stop a rule from firing where its diagnosis
 * would be a lie:
 *
 * - fatigue also needs a DECLINING CTR. A frequency of 4 on a campaign whose
 *   CTR is flat or rising is a small warm audience being worked, not a burnt
 *   creative, and telling someone to rebuild a working ad is bad advice.
 * - the hook/hold gates need video. A static image has no 3-second views, so
 *   its hook rate is 0/impressions = 0, which would fail every image ad on
 *   the account forever.
 * - "CPC high" only means "targeting" while the CTR is FINE. With a broken
 *   CTR the expensive clicks are a symptom of the copy, and low_ctr (an
 *   earlier gate) is already saying so.
 * - the CPA gate is the spec's `all_upper_funnel_metrics_healthy`: it is the
 *   diagnosis of last resort, and only earns the word "economic" once
 *   nothing upstream is broken.
 */
function extraConditionMet(ruleId: RuleId, input: DiagnosticInput, metrics: FunnelMetrics, thresholds: Thresholds, firedSoFar: RuleId[]): boolean {
  switch (ruleId) {
    case "high_frequency_fatigue":
      return input.ctrDeclining;
    case "low_hook_rate":
    case "low_hold_rate":
      return input.hasVideo;
    case "high_cpc_good_ctr":
      return metrics.ctrLinkClick !== null && metrics.ctrLinkClick >= thresholds.ctr_link_click;
    case "good_funnel_bad_roas":
      return firedSoFar.length === 0;
    default:
      return true;
  }
}

export function evaluateCampaign(input: DiagnosticInput, thresholds: Thresholds = DEFAULT_THRESHOLDS, baseline: AccountBaseline = { avgCpc: null, avgCpm: null }): DiagnosticResult {
  const metrics = funnelMetrics(input);

  const shortfalls: string[] = [];
  if (input.impressions < thresholds.min_impressions) shortfalls.push(`פחות מ־${thresholds.min_impressions.toLocaleString("he-IL")} חשיפות`);
  if (input.spend < thresholds.min_spend) shortfalls.push(`פחות מ־₪${thresholds.min_spend.toLocaleString("he-IL")} הוצאה`);
  if (input.daysActive < thresholds.min_days_active) shortfalls.push(`פחות מ־${thresholds.min_days_active} ימי פעילות`);

  // Below the noise floor a diagnosis is a coin flip dressed up as advice,
  // so the engine says so rather than picking whichever gate the randomness
  // happened to trip.
  if (shortfalls.length > 0) {
    return {
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      status: "insufficient_data",
      diagnoses: [],
      primaryBottleneck: null,
      primaryRuleId: null,
      insufficientReasonHe: `אין מספיק דאטה לאבחון: ${shortfalls.join(" · ")}`,
      metrics,
    };
  }

  const diagnoses: Diagnosis[] = [];
  const fired: RuleId[] = [];

  // Priority order, and every rule that has data is evaluated — the spec is
  // explicit that a campaign can be broken in more than one place at once,
  // and hiding the second problem just means finding it next week.
  for (const rule of RULES_IN_PRIORITY_ORDER) {
    const value = measuredValue(rule.id, metrics);
    if (value === null) continue;

    const threshold = resolveThreshold(rule, thresholds, baseline, input);
    if (threshold === null) continue;

    const failed = rule.higherIsWorse ? value > threshold : value < threshold;
    if (!failed) continue;
    if (!extraConditionMet(rule.id, input, metrics, thresholds, fired)) continue;

    const deviation = deviationFor(value, threshold, rule.higherIsWorse);
    diagnoses.push({
      ruleId: rule.id,
      labelHe: rule.labelHe,
      formulaHe: rule.formulaHe,
      diagnosisHe: rule.diagnosisHe,
      recommendedAction: rule.recommendedAction,
      actionDetailHe: rule.actionDetailHe,
      severity: severityFor(deviation),
      priority: rule.priority,
      metricValue: value,
      metricThreshold: threshold,
      deviation,
    });
    fired.push(rule.id);
  }

  // `diagnoses` is already in priority order, so the head is the earliest
  // failing gate — the one worth fixing first.
  const primary = diagnoses[0] ?? null;

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    status: diagnoses.length > 0 ? "bottleneck_found" : "healthy",
    diagnoses,
    primaryBottleneck: primary?.recommendedAction ?? null,
    primaryRuleId: primary?.ruleId ?? null,
    insufficientReasonHe: null,
    metrics,
  };
}

/**
 * Whether a series of daily CTRs is trending down, by comparing the newer
 * half of the window against the older half.
 *
 * A least-squares slope would be the textbook answer and is the wrong tool
 * here: daily ad CTR is spiky enough that a single high day at either end
 * swings the slope's sign. Half-vs-half over a whole week of days each is
 * far harder to flip, and the 10% margin keeps ordinary noise from reading
 * as decline — this feeds the fatigue rule, whose advice (rebuild the
 * creative) is expensive to follow on a false positive.
 */
export function isCtrDeclining(dailyCtr: number[], minDays = 6, marginPct = 0.1): boolean {
  const usable = dailyCtr.filter((value) => Number.isFinite(value));
  if (usable.length < minDays) return false;

  const midpoint = Math.floor(usable.length / 2);
  const older = usable.slice(0, midpoint);
  const newer = usable.slice(usable.length - midpoint);

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const olderMean = mean(older);
  if (olderMean <= 0) return false;

  return mean(newer) < olderMean * (1 - marginPct);
}
