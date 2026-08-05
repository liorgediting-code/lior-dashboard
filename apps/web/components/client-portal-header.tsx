"use client";

import { useState } from "react";
import { logoutClientAction, changeClientPasswordAction } from "@/lib/actions/client-auth";

export function ClientPortalHeader({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{clientName}</h1>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setShowPasswordForm((v) => !v)}>
            שינוי סיסמה
          </button>
          <form action={logoutClientAction.bind(null, clientId)}>
            <button type="submit" className="btn btn-secondary text-sm">
              התנתק
            </button>
          </form>
        </div>
      </div>
      {showPasswordForm && (
        <form action={changeClientPasswordAction.bind(null, clientId)} className="card mt-3 max-w-sm space-y-2">
          <p className="text-xs text-amber-700">
            שים לב: סיסמה חלשה או שנשלחה למישהו אחר עלולה לחשוף את הלידים שלך. שמור על הסיסמה בסודיות.
          </p>
          <input className="input" type="password" name="current_password" placeholder="סיסמה נוכחית" required />
          <input className="input" type="password" name="new_password" placeholder="סיסמה חדשה (8+ תווים)" required minLength={8} />
          <button type="submit" className="btn btn-primary text-sm">
            עדכן סיסמה
          </button>
        </form>
      )}
    </div>
  );
}
