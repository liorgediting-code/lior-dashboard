"use client";

import { useState } from "react";
import { regenerateWebhookSecretAction } from "@/lib/actions/client-webhook";

export function RegenerateWebhookSecretButton({ clientId, appBaseUrl }: { clientId: string; appBaseUrl: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const newSecret = await regenerateWebhookSecretAction(clientId);
    setSecret(newSecret);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={handleClick}>
        {pending ? "יוצר..." : "צור URL חדש"}
      </button>
      {secret && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">כתובת ה-Webhook (מוצגת פעם אחת בלבד — העתק עכשיו):</p>
          <code className="break-all font-mono text-xs">{`${appBaseUrl}/api/webhooks/leads/${clientId}?secret=${secret}`}</code>
        </div>
      )}
    </div>
  );
}
