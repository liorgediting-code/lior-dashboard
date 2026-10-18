import type { El, StageData, StageFormula, StageKind } from "./types";

// Pure funnel maths: no React, no canvas. A funnel is the set of stage cards
// connected by arrows; stage order and branching come from the arrows.

export const STAGE_W = 200;
export const STAGE_H = 110;

export const KIND_LABEL: Record<StageKind, string> = {
  traffic: "Traffic",
  lead: "Lead",
  call: "Call",
  meeting_booked: "Meeting booked",
  meeting_held: "Meeting held",
  closed: "Closed",
  other: "Other",
};

export const KIND_COLOR: Record<StageKind, string> = {
  traffic: "#1971c2",
  lead: "#6965db",
  call: "#0c8599",
  meeting_booked: "#f08c00",
  meeting_held: "#e8590c",
  closed: "#2f9e44",
  other: "#868e96",
};

// Typical conversion INTO a stage of this kind, in %. Editable per stage.
export const DEFAULT_BENCH: Partial<Record<StageKind, [number, number]>> = {
  lead: [2, 5],
  call: [20, 40],
  meeting_booked: [40, 70],
  meeting_held: [60, 80],
  closed: [15, 25],
};

export const HYPOTHESES: Partial<Record<StageKind, string[]>> = {
  lead: ["Offer or message is unclear", "Wrong audience reaches the page", "Form or landing page is slow or too long"],
  call: ["Slow follow-up after the lead arrives", "Leads are low intent", "No reminder or nurture before the call"],
  meeting_booked: ["Too much friction booking a time", "Call did not build enough trust or urgency", "Calendar availability is too narrow"],
  meeting_held: ["No-shows: no reminder the day before", "Booked too far in the future", "Meeting value not clear in advance"],
  closed: ["Pricing or offer friction", "No urgency or clear next step", "Meeting not tailored to the lead's problem"],
};
const GENERIC_HYPOTHESES = ["Message mismatch between this step and the previous one", "Too much friction at this step", "Volume too low to judge, collect more data"];

export type Status = "good" | "warn" | "bad" | "unknown";

export const isStage = (el: El): el is El & { stage: StageData } => el.type === "funnel" && !!el.stage;

export function newStage(patch: Partial<StageData> = {}): StageData {
  return { name: "Stage", kind: "lead", volume: null, cost: null, dealValue: null, custom: [], ...patch };
}

/** Lower-case id used by formulas: letters/digits of any script, joined by "_". */
export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

export function benchFor(st: StageData): [number, number] | null {
  if (st.benchMin != null || st.benchMax != null) {
    const d = DEFAULT_BENCH[st.kind];
    const min = st.benchMin ?? d?.[0] ?? 0;
    const max = st.benchMax ?? d?.[1] ?? Math.max(min, 100);
    return [min, Math.max(min, max)];
  }
  return DEFAULT_BENCH[st.kind] ?? null;
}

// ---- graph from arrows ----

export interface Edge { from: string; to: string }

const rectOf = (el: El) => ({
  x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h),
});

function stageAt(stages: El[], px: number, py: number, tol: number): El | null {
  let best: El | null = null, bestD = Infinity;
  for (const s of stages) {
    const r = rectOf(s);
    if (px < r.x - tol || px > r.x + r.w + tol || py < r.y - tol || py > r.y + r.h + tol) continue;
    const d = Math.hypot(px - (r.x + r.w / 2), py - (r.y + r.h / 2));
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/** An arrow from one stage card to another is an edge. */
export function stageEdges(els: El[], tol = 30): Edge[] {
  const stages = els.filter(isStage);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const a of els) {
    if (a.type !== "arrow" && a.type !== "thickarrow") continue;
    const f = stageAt(stages, a.x, a.y, tol), t = stageAt(stages, a.x + a.w, a.y + a.h, tol);
    if (!f || !t || f.id === t.id) continue;
    const key = f.id + ">" + t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: f.id, to: t.id });
  }
  return out;
}

export interface FunnelGraph { ids: string[]; edges: Edge[] }

/** Groups stages into funnels (connected components), ordered left to right
 *  by the arrows. Edges that would close a cycle are dropped. */
export function buildFunnels(els: El[]): FunnelGraph[] {
  const stages = els.filter(isStage);
  const byId = new Map(stages.map((s) => [s.id, s]));
  const edges = stageEdges(els);
  const parent = new Map(stages.map((s) => [s.id, s.id]));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  for (const e of edges) parent.set(find(e.from), find(e.to));

  const groups = new Map<string, string[]>();
  for (const s of stages) {
    const r = find(s.id);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(s.id);
  }

  const funnels: FunnelGraph[] = [];
  for (const members of Array.from(groups.values())) {
    const set = new Set(members);
    const es = edges.filter((e) => set.has(e.from) && set.has(e.to));
    const out = new Map<string, string[]>();
    const indeg = new Map<string, number>(members.map((m) => [m, 0]));
    for (const e of es) { (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1); }
    const byX = (a: string, b: string) => byId.get(a)!.x - byId.get(b)!.x;
    const starts = members.filter((m) => !indeg.get(m)).sort(byX);
    const state = new Map<string, 1 | 2>(); // 1 = on the stack, 2 = done
    const post: string[] = [];
    const back = new Set<string>();
    const visit = (u: string) => {
      state.set(u, 1);
      for (const v of (out.get(u) ?? []).slice().sort(byX)) {
        if (state.get(v) === 1) back.add(u + ">" + v);
        else if (!state.get(v)) visit(v);
      }
      state.set(u, 2);
      post.push(u);
    };
    for (const s of [...starts, ...members.slice().sort(byX)]) if (!state.get(s)) visit(s);
    funnels.push({
      ids: post.reverse(),
      edges: es.filter((e) => !back.has(e.from + ">" + e.to)),
    });
  }
  funnels.sort((a, b) => byId.get(a.ids[0])!.y - byId.get(b.ids[0])!.y);
  return funnels;
}

// ---- formulas ----

/** Evaluates + - * / ( ) over numbers and identifiers. Returns null on any
 *  error (bad syntax, unknown name, divide by zero). Never uses eval. */
export function evalFormula(expr: string, env: Map<string, number>): number | null {
  const tokens = expr.match(/\s*(\d+(?:\.\d+)?|[\p{L}_][\p{L}\p{N}_.]*|[-+*/()]|\S)/gu);
  if (!tokens) return null;
  const toks = tokens.map((t) => t.trim()).filter(Boolean);
  let i = 0;
  let bad = false;
  const peek = () => toks[i];
  const primary = (): number => {
    const t = toks[i++];
    if (t === undefined) { bad = true; return 0; }
    if (t === "(") {
      const v = sum();
      if (toks[i++] !== ")") bad = true;
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    if (/^\d/.test(t)) return Number(t);
    if (/^[\p{L}_]/u.test(t)) {
      const v = env.get(t.toLowerCase());
      if (v === undefined || !Number.isFinite(v)) { bad = true; return 0; }
      return v;
    }
    bad = true;
    return 0;
  };
  const product = (): number => {
    let v = primary();
    while (peek() === "*" || peek() === "/") {
      const op = toks[i++];
      const r = primary();
      if (op === "/") { if (r === 0) { bad = true; return 0; } v /= r; } else v *= r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") {
      const op = toks[i++];
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  if (bad || i !== toks.length || !Number.isFinite(v)) return null;
  return v;
}

// ---- analysis ----

export interface EdgeStat {
  from: string;
  to: string;
  conv: number | null; // 0..1
  drop: number | null; // 0..1
  lost: number | null; // people lost on this step
  status: Status;
  bench: [number, number] | null;
}

export interface StageView {
  conv: number | null; // best/first incoming conversion
  status: Status;
  bottleneck: boolean;
  cumConv: number | null; // from the funnel's root volume
  cumCost: number | null; // this stage plus everything before it
}

export interface MetricRow { key: string; label: string; value: number | null; kind: "money" | "percent" | "number" }

export interface FunnelAnalysis {
  ids: string[];
  title: string;
  edges: EdgeStat[];
  bottleneck: EdgeStat | null;
  hypotheses: string[];
  totalCost: number | null;
  revenue: number | null;
  rows: MetricRow[]; // CAC, cost per lead / call / meeting, ROI
  formulas: StageFormula[];
  custom: { formula: StageFormula; value: number | null }[];
}

export interface Analysis {
  funnels: FunnelAnalysis[];
  views: Map<string, StageView>;
}

const COST_PER: { kind: StageKind; key: string; label: string }[] = [
  { kind: "lead", key: "cost_per_lead", label: "Cost per lead" },
  { kind: "call", key: "cost_per_call", label: "Cost per call" },
  { kind: "meeting_booked", key: "cost_per_meeting_booked", label: "Cost per meeting booked" },
  { kind: "meeting_held", key: "cost_per_meeting", label: "Cost per meeting" },
];

const sumKnown = (xs: (number | null)[]): number | null => {
  const k = xs.filter((x): x is number => x != null);
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
};

export function statusFor(conv: number | null, bench: [number, number] | null): Status {
  if (conv == null || !bench) return "unknown";
  const pct = conv * 100;
  if (pct >= bench[0]) return "good";
  if (pct >= bench[0] * 0.8) return "warn";
  return "bad";
}

export function analyze(els: El[]): Analysis {
  const byId = new Map(els.filter(isStage).map((s) => [s.id, s.stage]));
  const views = new Map<string, StageView>();
  const funnels: FunnelAnalysis[] = [];

  for (const g of buildFunnels(els)) {
    const preds = new Map<string, string[]>(g.ids.map((id) => [id, []]));
    for (const e of g.edges) preds.get(e.to)!.push(e.from);
    const ancestors = (id: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [...preds.get(id)!];
      while (stack.length) { const p = stack.pop()!; if (!seen.has(p)) { seen.add(p); stack.push(...preds.get(p)!); } }
      return seen;
    };

    const edges: EdgeStat[] = g.edges.map((e) => {
      const a = byId.get(e.from)!, b = byId.get(e.to)!;
      const conv = a.volume != null && b.volume != null && a.volume > 0 ? b.volume / a.volume : null;
      const bench = benchFor(b);
      return {
        from: e.from, to: e.to, conv,
        drop: conv == null ? null : 1 - conv,
        lost: a.volume != null && b.volume != null ? a.volume - b.volume : null,
        status: statusFor(conv, bench), bench,
      };
    });

    const withLoss = edges.filter((e) => e.lost != null && e.lost > 0);
    const bottleneck = withLoss.length ? withLoss.reduce((m, e) => (e.lost! > m.lost! ? e : m)) : null;

    const rootVol = (id: string): number | null => {
      const roots = [...ancestors(id), id].filter((r) => !preds.get(r)!.length);
      return sumKnown(roots.map((r) => byId.get(r)!.volume));
    };

    for (const id of g.ids) {
      const st = byId.get(id)!;
      const incoming = edges.filter((e) => e.to === id);
      const rank = { bad: 0, warn: 1, good: 2, unknown: 3 } as const;
      const worst = incoming.slice().sort((x, y) => rank[x.status] - rank[y.status])[0];
      const rv = rootVol(id);
      views.set(id, {
        conv: worst?.conv ?? null,
        status: worst?.status ?? "unknown",
        bottleneck: !!bottleneck && bottleneck.to === id,
        cumConv: st.volume != null && rv ? st.volume / rv : null,
        cumCost: sumKnown([st.cost, ...[...ancestors(id)].map((a) => byId.get(a)!.cost)]),
      });
    }

    const totalCost = sumKnown(g.ids.map((id) => byId.get(id)!.cost));
    const closed = g.ids.map((id) => byId.get(id)!).filter((s) => s.kind === "closed");
    const closedVol = sumKnown(closed.map((s) => s.volume));
    const deals = closed.filter((s) => s.volume != null && s.dealValue != null);
    const revenue = deals.length ? deals.reduce((a, s) => a + s.volume! * s.dealValue!, 0) : null;
    const cac = totalCost != null && closedVol ? totalCost / closedVol : null;
    const roi = revenue != null && totalCost ? (revenue - totalCost) / totalCost : null;

    const rows: MetricRow[] = [{ key: "cac", label: "CAC", value: cac, kind: "money" }];
    for (const c of COST_PER) {
      const id = g.ids.find((i) => byId.get(i)!.kind === c.kind && (byId.get(i)!.volume ?? 0) > 0);
      const cum = id ? views.get(id)!.cumCost : null;
      rows.push({ key: c.key, label: c.label, value: id && cum != null ? cum / byId.get(id)!.volume! : null, kind: "money" });
    }
    rows.push({ key: "revenue", label: "Revenue", value: revenue, kind: "money" });
    rows.push({ key: "roi", label: "ROI", value: roi, kind: "percent" });

    const env = new Map<string, number>();
    const put = (k: string, v: number | null) => { if (v != null && k && !env.has(k)) env.set(k, v); };
    put("cost", totalCost); put("revenue", revenue); put("cac", cac);
    for (const id of g.ids) {
      const st = byId.get(id)!, sl = slug(st.name);
      put("vol." + sl, st.volume); put("cost." + sl, st.cost);
      for (const f of st.custom) {
        const n = Number(f.value);
        if (f.value.trim() !== "" && Number.isFinite(n)) put(sl + "." + slug(f.label), n);
      }
    }
    const formulas = g.ids.map((id) => byId.get(id)!.formulas).find((f) => f) ?? [];

    const target = bottleneck ? byId.get(bottleneck.to)! : null;
    funnels.push({
      ids: g.ids,
      title: g.ids.map((id) => byId.get(id)!.name).join(" → "),
      edges, bottleneck,
      hypotheses: target ? HYPOTHESES[target.kind] ?? GENERIC_HYPOTHESES : [],
      totalCost, revenue, rows, formulas,
      custom: formulas.map((formula) => ({ formula, value: evalFormula(formula.expr, env) })),
    });
  }
  return { funnels, views };
}
