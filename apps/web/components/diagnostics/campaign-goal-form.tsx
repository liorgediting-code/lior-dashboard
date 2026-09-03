"use client";

import { useState, useTransition } from "react";
import { saveCampaignGoal } from "@/lib/actions/diagnostics";
import type { ConversionGoal } from "@dashboard-lior/shared";

/**
 * The two numbers only the operator knows: what a conversion may cost, and
 * which action counts as one. Both feed the funnel's bottom gate, which stays
 * silent until a target CPA exists.
 */
export function CampaignGoalForm({
  campaignId,
  targetCpa,
  conversionGoal,
}: {
  campaignId: string;
  targetCpa: number | null;
  conversionGoal: ConversionGoal;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [cpa, setCpa] = useState(targetCpa === null ? "" : String(targetCpa));
  const [goal, setGoal] = useState<ConversionGoal>(conversionGoal);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={() =>
        startTransition(async () => {
          setMessage(null);
          const trimmed = cpa.trim();
          const parsed = trimmed === "" ? null : Number(trimmed);
          if (parsed !== null && !Number.isFinite(parsed)) {
            setMessage({ tone: "error", text: "יעד CPA חייב להיות מספר" });
            return;
          }
          const result = await saveCampaignGoal(campaignId, parsed, goal);
          setMessage(result.ok ? { tone: "ok", text: "נשמר" } : { tone: "error", text: result.error });
        })
      }
    >
      <div>
        <label className="label text-xs" htmlFor={`target-cpa-${campaignId}`}>
          יעד CPA (₪)
        </label>
        <input
          className="input w-32"
          id={`target-cpa-${campaignId}`}
          type="number"
          step="any"
          min="0"
          value={cpa}
          onChange={(event) => setCpa(event.target.value)}
          placeholder="לא הוגדר"
        />
      </div>

      <div>
        <label className="label text-xs" htmlFor={`goal-${campaignId}`}>
          מה נחשב המרה
        </label>
        <select className="input w-36" id={`goal-${campaignId}`} value={goal} onChange={(event) => setGoal(event.target.value as ConversionGoal)}>
          <option value="leads">לידים</option>
          <option value="purchases">רכישות</option>
        </select>
      </div>

      <button type="submit" className="btn btn-secondary text-sm" disabled={isPending}>
        {isPending ? "שומר..." : "שמור"}
      </button>
      {message && <span className={`text-xs ${message.tone === "error" ? "text-rose-600" : "text-emerald-600"}`}>{message.text}</span>}
    </form>
  );
}
