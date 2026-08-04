"use client";

import { useState } from "react";
import { regenerateClientPasswordAction } from "@/lib/actions/client-auth";

export function RegeneratePasswordButton({ clientId }: { clientId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const newPassword = await regenerateClientPasswordAction(clientId);
    setPassword(newPassword);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={handleClick}>
        {pending ? "יוצר..." : "צור סיסמה חדשה"}
      </button>
      {password && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">הסיסמה החדשה (מוצגת פעם אחת בלבד — העתק עכשיו):</p>
          <code className="font-mono">{password}</code>
        </div>
      )}
    </div>
  );
}
