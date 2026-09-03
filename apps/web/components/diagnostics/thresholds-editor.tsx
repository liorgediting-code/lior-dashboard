"use client";

import { useState, useTransition } from "react";
import { saveDiagnosticThresholds } from "@/lib/actions/diagnostics";
import { DEFAULT_THRESHOLDS, THRESHOLD_LABELS_HE, type Thresholds } from "@/lib/diagnostics/rules";
import { THRESHOLD_KEYS, type ThresholdKeyName } from "@/lib/diagnostics/thresholds";

/** Which fields the operator types as a percentage; lib/actions/diagnostics.ts converts them back. */
const PERCENT_FIELDS = new Set<ThresholdKeyName>(["hook_rate", "hold_rate", "ctr_link_click", "landing_page_conversion_rate"]);

const HINTS: Partial<Record<ThresholdKeyName, string>> = {
  cpc_account_multiple: "כפולה של ה-CPC הממוצע בחשבון",
  cpm_account_multiple: "כפולה של ה-CPM הממוצע בחשבון",
  min_impressions: "מתחת לזה הקמפיין יסומן «אין מספיק דאטה»",
};

function displayValue(key: ThresholdKeyName, value: number): string {
  return PERCENT_FIELDS.has(key) ? String(Number((value * 100).toFixed(2))) : String(value);
}

/**
 * Per-client (or global) threshold editing.
 *
 * A B2B lead-gen campaign and an e-commerce campaign genuinely fail at
 * different numbers, and a fixed 1% CTR floor would flag one of them
 * permanently — which is how a diagnostic page stops being read.
 */
export function ThresholdsEditor({
  clientId,
  clientName,
  effective,
}: {
  /** Empty string edits the global row. */
  clientId: string;
  clientName: string;
  effective: Thresholds;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  const customised = THRESHOLD_KEYS.filter((key) => effective[key] !== DEFAULT_THRESHOLDS[key]);

  return (
    <div className="card">
      <button type="button" className="flex w-full items-center justify-between text-start" onClick={() => setOpen((value) => !value)}>
        <span className="font-semibold">
          ספי אבחון · {clientName}
          {customised.length > 0 && <span className="ms-2 badge badge-suspect">{customised.length} מותאמים</span>}
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form
          className="mt-3 space-y-3"
          action={(formData) =>
            startTransition(async () => {
              setMessage(null);
              const result = await saveDiagnosticThresholds(formData);
              setMessage(result.ok ? { tone: "ok", text: "נשמר" } : { tone: "error", text: result.error });
            })
          }
        >
          <input type="hidden" name="client_id" value={clientId} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THRESHOLD_KEYS.map((key) => (
              <div key={key}>
                <label className="label text-xs" htmlFor={`threshold-${clientId}-${key}`}>
                  {THRESHOLD_LABELS_HE[key]}
                  {PERCENT_FIELDS.has(key) && <span className="text-slate-400"> (%)</span>}
                </label>
                <input
                  className="input"
                  id={`threshold-${clientId}-${key}`}
                  name={key}
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={displayValue(key, effective[key])}
                  placeholder={displayValue(key, DEFAULT_THRESHOLDS[key])}
                />
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {HINTS[key] ?? `ברירת מחדל: ${displayValue(key, DEFAULT_THRESHOLDS[key])}${PERCENT_FIELDS.has(key) ? "%" : ""}`}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">שדה ריק = ירושה מברירת המחדל (או מהספים הגלובליים, בעריכת לקוח).</p>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary text-sm" disabled={isPending}>
              {isPending ? "שומר..." : "שמור ספים"}
            </button>
            {message && <span className={`text-xs ${message.tone === "error" ? "text-rose-600" : "text-emerald-600"}`}>{message.text}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
