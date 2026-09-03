import type { DiagnosticResult } from "@/lib/diagnostics/engine";
import type { Thresholds } from "@/lib/diagnostics/rules";
import { formatCurrency, formatNumber } from "@/lib/format";

/**
 * The funnel as five gates, left to right, each coloured by whether it passed.
 *
 * The point of the page is that a campaign fails at ONE place and everything
 * downstream is a consequence — a strip of five numbers makes that legible in
 * a way a table of twelve KPIs never does.
 */

type Gate = {
  key: string;
  label: string;
  /** The measured rate, or null when its denominator was zero. */
  value: number | null;
  threshold: number | null;
  format: "percent" | "currency" | "ratio";
  higherIsWorse: boolean;
  /** Gates that do not apply (a still image has no hook rate) render greyed rather than failed. */
  notApplicable?: boolean;
};

function formatGate(value: number | null, format: Gate["format"]): string {
  if (value === null) return "—";
  if (format === "percent") return `${(value * 100).toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;
  if (format === "currency") return formatCurrency(value);
  return formatNumber(value);
}

export function gatesFor(result: DiagnosticResult, thresholds: Thresholds, hasVideo: boolean): Gate[] {
  const { metrics } = result;
  return [
    {
      key: "hook",
      label: "Hook (3 שנ׳)",
      value: metrics.hookRate,
      threshold: thresholds.hook_rate,
      format: "percent",
      higherIsWorse: false,
      notApplicable: !hasVideo,
    },
    {
      key: "hold",
      label: "Hold (50%)",
      value: metrics.holdRate,
      threshold: thresholds.hold_rate,
      format: "percent",
      higherIsWorse: false,
      notApplicable: !hasVideo,
    },
    { key: "ctr", label: "CTR", value: metrics.ctrLinkClick, threshold: thresholds.ctr_link_click, format: "percent", higherIsWorse: false },
    {
      key: "lp",
      label: "המרה בעמוד",
      value: metrics.landingPageConversionRate,
      threshold: thresholds.landing_page_conversion_rate,
      format: "percent",
      higherIsWorse: false,
    },
    { key: "freq", label: "תדירות", value: metrics.frequency, threshold: thresholds.frequency, format: "ratio", higherIsWorse: true },
  ];
}

function gateTone(gate: Gate): string {
  if (gate.notApplicable || gate.value === null || gate.threshold === null) return "border-slate-200 bg-slate-50 text-slate-400";
  const failed = gate.higherIsWorse ? gate.value > gate.threshold : gate.value < gate.threshold;
  return failed ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function FunnelStrip({ result, thresholds, hasVideo }: { result: DiagnosticResult; thresholds: Thresholds; hasVideo: boolean }) {
  const gates = gatesFor(result, thresholds, hasVideo);

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
      {gates.map((gate) => (
        <div key={gate.key} className={`rounded-lg border px-2.5 py-1.5 ${gateTone(gate)}`}>
          <div className="text-[11px] opacity-80">{gate.label}</div>
          <div className="text-sm font-semibold tabular-nums">
            {gate.notApplicable ? "לא רלוונטי" : formatGate(gate.value, gate.format)}
          </div>
          {!gate.notApplicable && gate.threshold !== null && (
            <div className="text-[10px] opacity-70 tabular-nums">
              יעד {gate.higherIsWorse ? "עד" : "מ־"} {formatGate(gate.threshold, gate.format)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
