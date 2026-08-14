"use client";

import { useTransition } from "react";
import { syncVideosForClient } from "@/lib/actions/videos";

export function VideoSyncButton({ clientId }: { clientId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-secondary text-sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            await syncVideosForClient(clientId);
          } catch (err) {
            alert(err instanceof Error ? err.message : "הסנכרון נכשל");
          }
        })
      }
    >
      {isPending ? "מסנכרן..." : "סנכרן מ-Drive"}
    </button>
  );
}
