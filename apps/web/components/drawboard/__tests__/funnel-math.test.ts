import { describe, expect, it } from "vitest";
import { analyze, buildFunnels, evalFormula, newStage, slug, statusFor, STAGE_H, STAGE_W } from "../funnel-math";
import type { El, StageData } from "../types";

let n = 0;
const card = (x: number, y: number, patch: Partial<StageData>): El => ({
  id: "s" + ++n, type: "funnel", x, y, w: STAGE_W, h: STAGE_H, stroke: "#000", fill: "#fff", sw: 1, seed: 1,
  stage: newStage(patch),
});
// Arrow from the right edge of a to the left edge of b.
const arrow = (a: El, b: El): El => ({
  id: "a" + ++n, type: "arrow", x: a.x + a.w, y: a.y + a.h / 2, w: b.x - (a.x + a.w), h: b.y - a.y,
  stroke: "#000", fill: "transparent", sw: 2, seed: 1,
});

describe("buildFunnels", () => {
  it("orders a linear funnel by its arrows, not by array order", () => {
    const a = card(0, 0, { name: "A" }), b = card(300, 0, { name: "B" }), c = card(600, 0, { name: "C" });
    const f = buildFunnels([c, a, b, arrow(a, b), arrow(b, c)]);
    expect(f).toHaveLength(1);
    expect(f[0].ids).toEqual([a.id, b.id, c.id]);
  });

  it("keeps unconnected stages as separate funnels", () => {
    const a = card(0, 0, {}), b = card(0, 400, {});
    expect(buildFunnels([a, b])).toHaveLength(2);
  });

  it("ignores a back-edge that would close a cycle", () => {
    const a = card(0, 0, {}), b = card(300, 0, {});
    const f = buildFunnels([a, b, arrow(a, b), arrow(b, a)]);
    expect(f[0].edges).toEqual([{ from: a.id, to: b.id }]);
    expect(f[0].ids).toEqual([a.id, b.id]);
  });
});

describe("analyze", () => {
  const build = () => {
    const lead = card(0, 0, { name: "Lead", kind: "lead", volume: 1000, cost: 2000 });
    const call = card(300, 0, { name: "Call", kind: "call", volume: 300, cost: 500 });
    const booked = card(600, 0, { name: "Booked", kind: "meeting_booked", volume: 100 });
    const held = card(900, 0, { name: "Held", kind: "meeting_held", volume: 60 });
    const won = card(1200, 0, { name: "Won", kind: "closed", volume: 10, dealValue: 5000 });
    const els = [lead, call, booked, held, won, arrow(lead, call), arrow(call, booked), arrow(booked, held), arrow(held, won)];
    return { els, lead, call, booked, held, won };
  };

  it("computes conversion, drop-off and the largest absolute leak", () => {
    const { els, lead, call, booked } = build();
    const a = analyze(els).funnels[0];
    const e = a.edges.find((x) => x.to === call.id)!;
    expect(e.conv).toBeCloseTo(0.3);
    expect(e.drop).toBeCloseTo(0.7);
    expect(a.bottleneck).toMatchObject({ from: lead.id, to: call.id, lost: 700 });
    expect(analyze(els).views.get(call.id)!.bottleneck).toBe(true);
    expect(analyze(els).views.get(booked.id)!.bottleneck).toBe(false);
  });

  it("attributes cumulative cost per stage kind and computes CAC / ROI", () => {
    const a = analyze(build().els).funnels[0];
    const row = (k: string) => a.rows.find((r) => r.key === k)!.value;
    expect(a.totalCost).toBe(2500);
    expect(row("cac")).toBe(250);
    expect(row("cost_per_lead")).toBe(2);
    expect(row("cost_per_call")).toBeCloseTo(2500 / 300);
    expect(row("cost_per_meeting_booked")).toBe(25);
    expect(row("cost_per_meeting")).toBeCloseTo(2500 / 60);
    expect(row("revenue")).toBe(50000);
    expect(row("roi")).toBeCloseTo((50000 - 2500) / 2500);
  });

  it("leaves metrics null instead of 0 or NaN when data is missing", () => {
    const a = card(0, 0, { kind: "lead" }), b = card(300, 0, { kind: "closed" });
    const f = analyze([a, b, arrow(a, b)]).funnels[0];
    expect(f.edges[0].conv).toBeNull();
    expect(f.bottleneck).toBeNull();
    expect(f.rows.every((r) => r.value === null)).toBe(true);
  });

  it("does not divide by a zero volume", () => {
    const a = card(0, 0, { volume: 0 }), b = card(300, 0, { volume: 0, kind: "closed", cost: 10 });
    const f = analyze([a, b, arrow(a, b)]).funnels[0];
    expect(f.edges[0].conv).toBeNull();
    expect(f.rows.find((r) => r.key === "cac")!.value).toBeNull();
  });

  it("handles a branch: each edge has its own conversion", () => {
    const lead = card(0, 0, { name: "Lead", volume: 100 });
    const wa = card(300, -200, { name: "WA", kind: "call", volume: 40 });
    const ph = card(300, 200, { name: "Phone", kind: "call", volume: 10 });
    const f = analyze([lead, wa, ph, arrow(lead, wa), arrow(lead, ph)]).funnels[0];
    expect(f.edges.map((e) => e.conv).sort()).toEqual([0.1, 0.4]);
  });

  it("evaluates custom formulas against stage values and custom fields", () => {
    const { els, won } = build();
    const lead = els[0];
    lead.stage!.custom = [{ id: "1", label: "Ad spend", value: "1800" }];
    won.stage!.formulas = [
      { id: "f1", name: "Cost per won", expr: "cost / vol.won" },
      { id: "f2", name: "Ad share", expr: "lead.ad_spend / cost.lead" },
      { id: "f3", name: "Broken", expr: "cost / vol.nope" },
    ];
    const f = analyze(els).funnels[0];
    expect(f.custom.map((c) => c.value)).toEqual([250, 0.9, null]);
  });
});

describe("statusFor", () => {
  it("is green at the benchmark floor, yellow within 20%, red below", () => {
    expect(statusFor(0.2, [20, 40])).toBe("good");
    expect(statusFor(0.17, [20, 40])).toBe("warn");
    expect(statusFor(0.1, [20, 40])).toBe("bad");
    expect(statusFor(null, [20, 40])).toBe("unknown");
    expect(statusFor(0.3, null)).toBe("unknown");
  });
});

describe("evalFormula", () => {
  const env = new Map([["cost", 100], ["vol.a", 4]]);
  it("respects precedence, parentheses and unary minus", () => {
    expect(evalFormula("1 + 2 * 3", env)).toBe(7);
    expect(evalFormula("(1 + 2) * 3", env)).toBe(9);
    expect(evalFormula("-cost / vol.a", env)).toBe(-25);
    expect(evalFormula("COST/VOL.A", env)).toBe(25);
  });
  it("returns null for bad input and never executes code", () => {
    for (const bad of ["", "1 +", "cost / 0", "unknown", "1 2", "(1", "alert(1)", "constructor", "process.exit()", "1; 2", "cost ** 2"]) {
      expect(evalFormula(bad, env)).toBeNull();
    }
  });
});

describe("slug", () => {
  it("keeps Hebrew and joins words with underscores", () => {
    expect(slug("Meeting Booked!")).toBe("meeting_booked");
    expect(slug("פגישה שנקבעה")).toBe("פגישה_שנקבעה");
  });
});
