import type { Diagnosis, Severity } from "@/lib/diagnostics/engine";
import { ACTION_LABELS_HE, type RecommendedAction } from "@/lib/diagnostics/rules";
import { formatCurrency } from "@/lib/format";

const SEVERITY_TONE: Record<Severity, string> = {
  high: "border-rose-200 bg-rose-50",
  medium: "border-amber-200 bg-amber-50",
  low: "border-slate-200 bg-slate-50",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "חמור",
  medium: "בינוני",
  low: "קל",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  high: "badge badge-kill",
  medium: "badge badge-suspect",
  low: "badge badge-insufficient",
};

export const ACTION_TONE: Record<RecommendedAction, string> = {
  creative: "bg-violet-100 text-violet-800 ring-violet-200",
  copy: "bg-sky-100 text-sky-800 ring-sky-200",
  targeting: "bg-amber-100 text-amber-800 ring-amber-200",
  landing_page: "bg-teal-100 text-teal-800 ring-teal-200",
  new_variations: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
  offer_or_pricing: "bg-slate-200 text-slate-800 ring-slate-300",
};

export function ActionBadge({ action, prefix }: { action: RecommendedAction; prefix?: string }) {
  return (
    <span className={`badge ${ACTION_TONE[action]}`}>
      {prefix ? `${prefix} ` : ""}
      {ACTION_LABELS_HE[action]}
    </span>
  );
}

/**
 * A value and its threshold in the same units. Rates read as percentages,
 * money as shekels — showing a CPC as "2.5" next to a hook rate of "0.14"
 * would make both unreadable.
 */
function formatMeasure(diagnosis: Diagnosis): { value: string; threshold: string } {
  const isRate = ["low_hook_rate", "low_hold_rate", "low_ctr", "low_lp_conversion"].includes(diagnosis.ruleId);
  const isMoney = ["high_cpc_good_ctr", "low_cpm_efficiency", "good_funnel_bad_roas"].includes(diagnosis.ruleId);

  if (isRate) {
    const pct = (value: number) => `${(value * 100).toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;
    return { value: pct(diagnosis.metricValue), threshold: pct(diagnosis.metricThreshold) };
  }
  if (isMoney) {
    return { value: formatCurrency(diagnosis.metricValue), threshold: formatCurrency(diagnosis.metricThreshold) };
  }
  const ratio = (value: number) => value.toLocaleString("he-IL", { maximumFractionDigits: 2 });
  return { value: ratio(diagnosis.metricValue), threshold: ratio(diagnosis.metricThreshold) };
}

export function DiagnosisCard({ diagnosis, isPrimary }: { diagnosis: Diagnosis; isPrimary: boolean }) {
  const measure = formatMeasure(diagnosis);

  return (
    <div className={`rounded-xl border p-3 ${SEVERITY_TONE[diagnosis.severity]} ${isPrimary ? "ring-2 ring-blue-400/60" : ""}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {isPrimary && <span className="badge bg-blue-600 text-white ring-blue-700">צוואר הבקבוק העיקרי</span>}
        <span className="font-semibold text-slate-900">{diagnosis.labelHe}</span>
        <span className={SEVERITY_BADGE[diagnosis.severity]}>{SEVERITY_LABEL[diagnosis.severity]}</span>
        <ActionBadge action={diagnosis.recommendedAction} prefix="לתקן:" />
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
        <span className="tabular-nums">
          מדד: <strong className="text-slate-900">{measure.value}</strong> · סף: {measure.threshold}
        </span>
        <span className="tabular-nums">
          פער: {(diagnosis.deviation * 100).toLocaleString("he-IL", { maximumFractionDigits: 0 })}%
        </span>
        <span className="text-slate-400">{diagnosis.formulaHe}</span>
      </div>

      <p className="mb-1.5 text-sm text-slate-700">{diagnosis.diagnosisHe}</p>
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-800">מה לעשות: </span>
        {diagnosis.actionDetailHe}
      </p>
    </div>
  );
}

export function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  return (
    <div className="space-y-2">
      {diagnoses.map((diagnosis, index) => (
        <DiagnosisCard key={diagnosis.ruleId} diagnosis={diagnosis} isPrimary={index === 0} />
      ))}
    </div>
  );
}
