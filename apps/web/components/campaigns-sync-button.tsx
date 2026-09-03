"use client";

import { useState, useTransition } from "react";
import { syncAllCampaignsNow } from "@/lib/actions/campaigns";

type Feedback = { tone: "ok" | "error"; headline: string; notes: string[] };

/**
 * Nothing in this repo schedules /api/cron/daily-ad-sync (no vercel.json —
 * same situation as Instagram). This button runs it instead.
 */
export function CampaignsSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setFeedback(null);
              const result = await syncAllCampaignsNow();
              setFeedback(
                result.ok
                  ? { tone: "ok", headline: `סונכרנו ${result.synced} רשומות מ-${result.clients} לקוחות`, notes: result.notes }
                  : { tone: "error", headline: result.error, notes: [] }
              );
            })
          }
        >
          {isPending ? "מסנכרן..." : "סנכרן עכשיו"}
        </button>
        {feedback && <span className={`text-xs ${feedback.tone === "error" ? "text-rose-600" : "text-slate-500"}`}>{feedback.headline}</span>}
      </div>

      {/* Per-client skips and failures, spelled out. A silent "0 synced" is
          the failure mode this whole block exists to prevent. */}
      {feedback?.notes.length ? (
        <ul className="max-w-xl list-inside list-disc text-xs text-amber-700">
          {feedback.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
