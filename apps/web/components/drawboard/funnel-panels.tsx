"use client";

import { benchFor, DEFAULT_BENCH, KIND_LABEL, type Analysis, type FunnelAnalysis, type MetricRow } from "./funnel-math";
import { uid, type El, type StageData, type StageFormula, type StageKind } from "./types";

const KINDS = Object.keys(KIND_LABEL) as StageKind[];
const num = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const stop = (e: React.KeyboardEvent, onEscape: () => void) => {
  e.stopPropagation();
  if (e.key === "Escape") onEscape();
};

export function fmtMetric(row: Pick<MetricRow, "kind" | "value">): string {
  const v = row.value;
  if (v == null) return "—";
  if (row.kind === "percent") return `${(v * 100).toFixed(0)}%`;
  const abs = Math.abs(v);
  const s = v.toLocaleString("en-US", { maximumFractionDigits: abs >= 100 ? 0 : 2 });
  return row.kind === "money" ? `₪${s}` : s;
}

/** Modal for one stage's data: fixed fields, user-defined fields, notes. */
export function StagePanel({ el, onPatch, onClose }: { el: El; onPatch: (patch: Partial<StageData>) => void; onClose: () => void }) {
  const st = el.stage!;
  const bench = benchFor(st);
  const def = DEFAULT_BENCH[st.kind];
  const setField = (id: string, patch: Partial<{ label: string; value: string }>) =>
    onPatch({ custom: st.custom.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const key = (e: React.KeyboardEvent) => stop(e, onClose);

  return (
    <div className="doc-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="doc-panel stage-panel">
        <div className="doc-head">
          <input
            className="doc-title" dir="auto" autoFocus value={st.name} placeholder="Stage name"
            onChange={(e) => onPatch({ name: e.target.value })} onKeyDown={key}
          />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div className="stage-body">
          <div className="stage-grid">
            <label>Type
              <select value={st.kind} onChange={(e) => onPatch({ kind: e.target.value as StageKind })} onKeyDown={key}>
                {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label>Volume (people)
              <input type="number" min="0" value={st.volume ?? ""} onChange={(e) => onPatch({ volume: num(e.target.value) })} onKeyDown={key} />
            </label>
            <label>Cost (₪)
              <input type="number" min="0" value={st.cost ?? ""} onChange={(e) => onPatch({ cost: num(e.target.value) })} onKeyDown={key} />
            </label>
            {st.kind === "closed" && (
              <label>Deal value (₪)
                <input type="number" min="0" value={st.dealValue ?? ""} onChange={(e) => onPatch({ dealValue: num(e.target.value) })} onKeyDown={key} />
              </label>
            )}
            <label>From
              <input type="date" value={st.from ?? ""} onChange={(e) => onPatch({ from: e.target.value || undefined })} onKeyDown={key} />
            </label>
            <label>To
              <input type="date" value={st.to ?? ""} onChange={(e) => onPatch({ to: e.target.value || undefined })} onKeyDown={key} />
            </label>
          </div>

          <div className="stage-sec">Expected conversion into this stage (%)</div>
          <div className="stage-grid">
            <label>Min
              <input type="number" min="0" max="100" value={st.benchMin ?? ""} placeholder={def ? String(def[0]) : "—"}
                onChange={(e) => onPatch({ benchMin: num(e.target.value) ?? undefined })} onKeyDown={key} />
            </label>
            <label>Max
              <input type="number" min="0" max="100" value={st.benchMax ?? ""} placeholder={def ? String(def[1]) : "—"}
                onChange={(e) => onPatch({ benchMax: num(e.target.value) ?? undefined })} onKeyDown={key} />
            </label>
          </div>
          {!bench && <div className="stage-hint">No default for this type. Set a range to colour the conversion.</div>}

          <div className="stage-sec">Custom fields</div>
          {st.custom.map((f) => (
            <div className="field-row" key={f.id}>
              <input dir="auto" value={f.label} placeholder="Label" onChange={(e) => setField(f.id, { label: e.target.value })} onKeyDown={key} />
              <input dir="auto" value={f.value} placeholder="Value" onChange={(e) => setField(f.id, { value: e.target.value })} onKeyDown={key} />
              <button title="Remove" onClick={() => onPatch({ custom: st.custom.filter((x) => x.id !== f.id) })}>✕</button>
            </div>
          ))}
          <button className="add-row" onClick={() => onPatch({ custom: [...st.custom, { id: uid(), label: "", value: "" }] })}>＋ Add field</button>

          <div className="stage-sec">Notes / what to improve</div>
          <textarea
            className="stage-notes" dir="auto" rows={4} value={st.notes ?? ""} placeholder="Hypothesis, what to test, what changed…"
            onChange={(e) => onPatch({ notes: e.target.value })} onKeyDown={key}
          />
        </div>
      </div>
    </div>
  );
}

function FunnelCard({
  f, names, onFormulas, onFocus,
}: {
  f: FunnelAnalysis;
  names: Map<string, string>;
  onFormulas: (ids: string[], formulas: StageFormula[]) => void;
  onFocus: (id: string) => void;
}) {
  const setFormulas = (next: StageFormula[]) => onFormulas(f.ids, next);
  const patch = (id: string, p: Partial<StageFormula>) => setFormulas(f.formulas.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const b = f.bottleneck;
  return (
    <section className="fsum-card">
      <div className="fsum-title" dir="auto">{f.title}</div>

      <div className="fsum-grid">
        {f.rows.map((r) => (
          <div key={r.key} className="fsum-metric">
            <span>{r.label}</span>
            <b>{fmtMetric(r)}</b>
          </div>
        ))}
      </div>

      <div className="fsum-sec">Steps</div>
      {f.edges.length === 0 && <div className="fsum-empty">Connect stages with arrows to see conversion.</div>}
      {f.edges.map((e) => (
        <button key={e.from + e.to} className={"fsum-edge " + e.status} onClick={() => onFocus(e.to)}>
          <span dir="auto">{names.get(e.from)} → {names.get(e.to)}</span>
          <b>{e.conv == null ? "—" : `${(e.conv * 100).toFixed(1)}%`}</b>
          {e.bench && <small>target {e.bench[0]}–{e.bench[1]}%</small>}
        </button>
      ))}

      {b && (
        <div className="fsum-bottleneck">
          <b>Fix first:</b> <span dir="auto">{names.get(b.from)} → {names.get(b.to)}</span>
          <div>Loses {b.lost!.toLocaleString("en-US")} people ({(b.drop! * 100).toFixed(0)}%), the biggest leak.</div>
          <ul>{f.hypotheses.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}

      <div className="fsum-sec">My metrics</div>
      {f.custom.map(({ formula, value }) => (
        <div className="fsum-formula" key={formula.id}>
          <input dir="auto" value={formula.name} placeholder="Name" onChange={(e) => patch(formula.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          <input value={formula.expr} placeholder="cost / vol.won" onChange={(e) => patch(formula.id, { expr: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          <b>{value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b>
          <button title="Remove" onClick={() => setFormulas(f.formulas.filter((x) => x.id !== formula.id))}>✕</button>
        </div>
      ))}
      <button className="add-row" onClick={() => setFormulas([...f.formulas, { id: uid(), name: "", expr: "" }])}>＋ Add metric</button>
      <div className="fsum-hint">
        Use <code>cost</code>, <code>revenue</code>, <code>cac</code>, <code>vol.stage_name</code>, <code>cost.stage_name</code>, <code>stage_name.field_label</code> with + − × ÷ ( ).
      </div>
    </section>
  );
}

export function FunnelSummary({
  analysis, stages, onFormulas, onFocus, onClose,
}: {
  analysis: Analysis;
  stages: El[];
  onFormulas: (ids: string[], formulas: StageFormula[]) => void;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const names = new Map(stages.map((s) => [s.id, s.stage?.name || "Stage"]));
  return (
    <aside className="fsum" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="fsum-head">
        <b>Funnel summary</b>
        <button onClick={onClose} title="Hide">✕</button>
      </div>
      {analysis.funnels.map((f) => <FunnelCard key={f.ids[0]} f={f} names={names} onFormulas={onFormulas} onFocus={onFocus} />)}
    </aside>
  );
}
