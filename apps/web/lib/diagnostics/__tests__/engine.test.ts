import { describe, expect, it } from "vitest";
import { evaluateCampaign, funnelMetrics, isCtrDeclining, severityFor, type AccountBaseline, type DiagnosticInput } from "../engine";
import { DEFAULT_THRESHOLDS } from "../rules";

/**
 * A campaign that passes every gate: 25% hook, 40% hold, 2% CTR, 20% landing
 * page conversion, CPA well under target. Each test below breaks exactly one
 * of those, so a failure names the gate it broke.
 */
function healthyInput(overrides: Partial<DiagnosticInput> = {}): DiagnosticInput {
  return {
    campaignId: "c1",
    campaignName: "קמפיין בריא",
    dateRangeLabel: "30 ימים",
    impressions: 100_000,
    reach: 50_000, // frequency 2.0
    spend: 5_000,
    linkClicks: 2_000, // CTR 2%
    threeSecVideoViews: 25_000, // hook 25%
    video50Watched: 10_000, // hold 40%
    conversions: 400, // LP conversion 20%, CPA ₪12.50
    daysActive: 30,
    targetCpa: 50,
    ctrDeclining: false,
    hasVideo: true,
    ...overrides,
  };
}

const noBaseline: AccountBaseline = { avgCpc: null, avgCpm: null };

describe("funnelMetrics", () => {
  it("computes every funnel rate from the raw counts", () => {
    const metrics = funnelMetrics(healthyInput());
    expect(metrics.hookRate).toBeCloseTo(0.25);
    expect(metrics.holdRate).toBeCloseTo(0.4);
    expect(metrics.ctrLinkClick).toBeCloseTo(0.02);
    expect(metrics.cpc).toBeCloseTo(2.5);
    expect(metrics.cpm).toBeCloseTo(50);
    expect(metrics.frequency).toBeCloseTo(2);
    expect(metrics.landingPageConversionRate).toBeCloseTo(0.2);
    expect(metrics.cpa).toBeCloseTo(12.5);
  });

  it("returns null rather than Infinity or NaN for every zero denominator", () => {
    const metrics = funnelMetrics(
      healthyInput({ impressions: 0, reach: 0, linkClicks: 0, threeSecVideoViews: 0, conversions: 0 })
    );
    expect(metrics.hookRate).toBeNull();
    expect(metrics.holdRate).toBeNull();
    expect(metrics.ctrLinkClick).toBeNull();
    expect(metrics.cpc).toBeNull();
    expect(metrics.cpm).toBeNull();
    expect(metrics.frequency).toBeNull();
    expect(metrics.landingPageConversionRate).toBeNull();
    expect(metrics.cpa).toBeNull();
  });
});

describe("data thresholds", () => {
  it("refuses to diagnose below the impression floor", () => {
    const result = evaluateCampaign(healthyInput({ impressions: 500, threeSecVideoViews: 10 }));
    expect(result.status).toBe("insufficient_data");
    expect(result.diagnoses).toHaveLength(0);
    expect(result.primaryBottleneck).toBeNull();
    expect(result.insufficientReasonHe).toContain("חשיפות");
  });

  it("refuses to diagnose below the spend floor", () => {
    const result = evaluateCampaign(healthyInput({ spend: 10 }));
    expect(result.status).toBe("insufficient_data");
    expect(result.insufficientReasonHe).toContain("הוצאה");
  });

  it("refuses to diagnose a campaign that has barely run", () => {
    const result = evaluateCampaign(healthyInput({ daysActive: 1 }));
    expect(result.status).toBe("insufficient_data");
    expect(result.insufficientReasonHe).toContain("ימי פעילות");
  });

  it("names every shortfall at once rather than only the first", () => {
    const result = evaluateCampaign(healthyInput({ impressions: 100, spend: 5, daysActive: 1 }));
    expect(result.insufficientReasonHe).toContain("חשיפות");
    expect(result.insufficientReasonHe).toContain("הוצאה");
    expect(result.insufficientReasonHe).toContain("ימי פעילות");
  });

  it("still reports the metrics it could compute, so the numbers stay visible", () => {
    const result = evaluateCampaign(healthyInput({ impressions: 500, spend: 20 }));
    expect(result.metrics.impressions).toBe(500);
    expect(result.metrics.spend).toBe(20);
  });
});

describe("healthy campaigns", () => {
  it("reports no bottleneck when every gate passes", () => {
    const result = evaluateCampaign(healthyInput());
    expect(result.status).toBe("healthy");
    expect(result.diagnoses).toHaveLength(0);
    expect(result.primaryBottleneck).toBeNull();
  });
});

describe("stage 1 — creative", () => {
  it("flags a weak hook as a creative problem", () => {
    const result = evaluateCampaign(healthyInput({ threeSecVideoViews: 14_000, video50Watched: 7_000 }));
    expect(result.primaryRuleId).toBe("low_hook_rate");
    expect(result.primaryBottleneck).toBe("creative");
    expect(result.diagnoses[0].metricValue).toBeCloseTo(0.14);
    expect(result.diagnoses[0].metricThreshold).toBeCloseTo(0.2);
  });

  it("flags a weak hold as a creative problem when the hook itself is fine", () => {
    const result = evaluateCampaign(healthyInput({ video50Watched: 5_000 })); // hold 20%
    expect(result.primaryRuleId).toBe("low_hold_rate");
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("low_hook_rate");
  });

  it("skips both video gates for a static image ad instead of failing it forever", () => {
    // An image ad has no 3-second views at all, so hook rate reads 0 — the
    // one input that would otherwise fail every image campaign on the account.
    const result = evaluateCampaign(healthyInput({ hasVideo: false, threeSecVideoViews: 0, video50Watched: 0 }));
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("low_hook_rate");
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("low_hold_rate");
    expect(result.status).toBe("healthy");
  });
});

describe("stage 2 — copy and targeting", () => {
  it("flags a weak CTR as a copy problem", () => {
    const result = evaluateCampaign(healthyInput({ linkClicks: 500, conversions: 100 })); // CTR 0.5%
    expect(result.diagnoses.map((d) => d.ruleId)).toContain("low_ctr");
    expect(result.diagnoses.find((d) => d.ruleId === "low_ctr")?.recommendedAction).toBe("copy");
  });

  it("blames targeting for an expensive click only while the CTR is healthy", () => {
    const baseline: AccountBaseline = { avgCpc: 1, avgCpm: 50 };
    // CTR 2% (fine), CPC ₪2.50 against a ₪1.50 ceiling.
    const result = evaluateCampaign(healthyInput(), DEFAULT_THRESHOLDS, baseline);
    expect(result.diagnoses.map((d) => d.ruleId)).toContain("high_cpc_good_ctr");
    expect(result.diagnoses.find((d) => d.ruleId === "high_cpc_good_ctr")?.recommendedAction).toBe("targeting");
  });

  it("does not blame targeting when the clicks are expensive because the CTR is broken", () => {
    const baseline: AccountBaseline = { avgCpc: 1, avgCpm: 50 };
    const result = evaluateCampaign(healthyInput({ linkClicks: 500, conversions: 100 }), DEFAULT_THRESHOLDS, baseline);
    expect(result.diagnoses.map((d) => d.ruleId)).toContain("low_ctr");
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("high_cpc_good_ctr");
  });

  it("stays silent on CPC and CPM while the account has no baseline to compare against", () => {
    const result = evaluateCampaign(healthyInput(), DEFAULT_THRESHOLDS, noBaseline);
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("high_cpc_good_ctr");
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("low_cpm_efficiency");
  });
});

describe("stage 3 — landing page", () => {
  it("moves the blame off the ad when the clicks arrive but nobody converts", () => {
    const result = evaluateCampaign(healthyInput({ conversions: 40 })); // 2% of clicks
    expect(result.primaryRuleId).toBe("low_lp_conversion");
    expect(result.primaryBottleneck).toBe("landing_page");
  });
});

describe("stage 4 — economics", () => {
  it("calls an unaffordable CPA an offer problem when nothing upstream is broken", () => {
    const result = evaluateCampaign(healthyInput({ conversions: 50, targetCpa: 50 })); // CPA ₪100
    // 50 conversions on 2,000 clicks is 2.5% — under the 10% LP floor — so
    // the landing page gate fires first and the CPA gate correctly does not.
    expect(result.primaryRuleId).toBe("low_lp_conversion");
  });

  it("fires the CPA gate once the whole upper funnel is healthy", () => {
    // Everything passes; the acquisition simply costs more than the target.
    const result = evaluateCampaign(healthyInput({ targetCpa: 10 })); // CPA ₪12.50 vs ₪10
    expect(result.primaryRuleId).toBe("good_funnel_bad_roas");
    expect(result.primaryBottleneck).toBe("offer_or_pricing");
  });

  it("stays silent when no target CPA has been set", () => {
    const result = evaluateCampaign(healthyInput({ targetCpa: null }));
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("good_funnel_bad_roas");
    expect(result.status).toBe("healthy");
  });
});

describe("cross-cutting — ad fatigue", () => {
  it("fires on high frequency with a declining CTR", () => {
    const result = evaluateCampaign(healthyInput({ reach: 20_000, ctrDeclining: true })); // frequency 5
    expect(result.primaryRuleId).toBe("high_frequency_fatigue");
    expect(result.primaryBottleneck).toBe("new_variations");
  });

  it("does not fire on high frequency alone — a flat CTR is a warm audience, not a burnt creative", () => {
    const result = evaluateCampaign(healthyInput({ reach: 20_000, ctrDeclining: false }));
    expect(result.diagnoses.map((d) => d.ruleId)).not.toContain("high_frequency_fatigue");
  });

  it("outranks the funnel: a burnt creative explains the gate below it", () => {
    const result = evaluateCampaign(
      healthyInput({ reach: 20_000, ctrDeclining: true, threeSecVideoViews: 10_000, video50Watched: 4_000 })
    );
    expect(result.diagnoses.map((d) => d.ruleId)).toEqual(expect.arrayContaining(["high_frequency_fatigue", "low_hook_rate"]));
    expect(result.primaryRuleId).toBe("high_frequency_fatigue");
  });
});

describe("multiple simultaneous diagnoses", () => {
  it("reports every problem but names the earliest gate as primary", () => {
    const result = evaluateCampaign(
      healthyInput({ threeSecVideoViews: 8_000, video50Watched: 1_000, linkClicks: 400, conversions: 10 })
    );
    const ids = result.diagnoses.map((d) => d.ruleId);
    expect(ids).toContain("low_hook_rate");
    expect(ids).toContain("low_ctr");
    expect(ids).toContain("low_lp_conversion");
    expect(result.primaryRuleId).toBe("low_hook_rate");
  });

  it("lists diagnoses in funnel order", () => {
    const result = evaluateCampaign(
      healthyInput({ threeSecVideoViews: 8_000, video50Watched: 1_000, linkClicks: 400, conversions: 10 })
    );
    const priorities = result.diagnoses.map((d) => d.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
});

describe("severity", () => {
  it("scales with distance from the threshold rather than being a boolean", () => {
    expect(severityFor(0.05)).toBe("low");
    expect(severityFor(0.3)).toBe("medium");
    expect(severityFor(0.9)).toBe("high");
  });

  it("calls a hook rate a hair under the floor low, and a collapsed one high", () => {
    const marginal = evaluateCampaign(healthyInput({ threeSecVideoViews: 19_000 })); // 19% vs 20%
    const collapsed = evaluateCampaign(healthyInput({ threeSecVideoViews: 5_000, video50Watched: 2_500 })); // 5%
    expect(marginal.diagnoses[0].severity).toBe("low");
    expect(collapsed.diagnoses[0].severity).toBe("high");
  });
});

describe("custom thresholds", () => {
  it("honours a loosened per-client CTR floor", () => {
    const loose = { ...DEFAULT_THRESHOLDS, ctr_link_click: 0.004 };
    const input = healthyInput({ linkClicks: 500, conversions: 100 }); // CTR 0.5%
    expect(evaluateCampaign(input).diagnoses.map((d) => d.ruleId)).toContain("low_ctr");
    expect(evaluateCampaign(input, loose).diagnoses.map((d) => d.ruleId)).not.toContain("low_ctr");
  });

  it("honours a lowered data floor so a small test campaign can still be diagnosed", () => {
    const small = { ...DEFAULT_THRESHOLDS, min_impressions: 100, min_spend: 10, min_days_active: 1 };
    const input = healthyInput({ impressions: 500, spend: 20, daysActive: 2, threeSecVideoViews: 50, video50Watched: 20, linkClicks: 10, conversions: 2 });
    expect(evaluateCampaign(input).status).toBe("insufficient_data");
    expect(evaluateCampaign(input, small).status).not.toBe("insufficient_data");
  });
});

describe("isCtrDeclining", () => {
  it("detects a sustained decline across the window", () => {
    expect(isCtrDeclining([0.03, 0.03, 0.028, 0.02, 0.015, 0.012])).toBe(true);
  });

  it("ignores a flat series", () => {
    expect(isCtrDeclining([0.02, 0.021, 0.019, 0.02, 0.02, 0.021])).toBe(false);
  });

  it("ignores an improving series", () => {
    expect(isCtrDeclining([0.01, 0.012, 0.015, 0.02, 0.022, 0.03])).toBe(false);
  });

  it("refuses to call a trend on too few days", () => {
    expect(isCtrDeclining([0.03, 0.01])).toBe(false);
  });

  it("does not read ordinary noise as decline", () => {
    // 5% down over the window, inside the 10% margin.
    expect(isCtrDeclining([0.02, 0.02, 0.02, 0.019, 0.019, 0.019])).toBe(false);
  });

  it("is not flipped by a single spiky day at one end", () => {
    expect(isCtrDeclining([0.02, 0.02, 0.02, 0.02, 0.02, 0.05])).toBe(false);
  });
});
