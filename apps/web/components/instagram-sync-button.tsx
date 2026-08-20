"use client";

import { useState, useTransition } from "react";
import { syncInstagramNow } from "@/lib/actions/instagram";

/**
 * The page used to tell you to "run the daily cron" — which nothing in this
 * repo schedules. This button runs it instead.
 */
export function InstagramSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary text-sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            try {
              const result = await syncInstagramNow();
              setMessage(`עודכנו ${result.dailyRows} ימים ו-${result.mediaCount} פוסטים`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "הסנכרון נכשל");
            }
          })
        }
      >
        {isPending ? "מסנכרן..." : "סנכרן עכשיו"}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
