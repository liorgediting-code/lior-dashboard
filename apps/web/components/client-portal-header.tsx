"use client";

import { useState } from "react";
import { logoutClientAction, changeClientPasswordAction } from "@/lib/actions/client-auth";

const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  wrong_password: "הסיסמה הנוכחית שהזנת שגויה.",
  too_short: "סיסמה חדשה חייבת להיות באורך 8 תווים לפחות.",
};

export function ClientPortalHeader({
  clientId,
  clientName,
  passwordSuccess,
  passwordError,
}: {
  clientId: string;
  clientName: string;
  passwordSuccess?: boolean;
  passwordError?: string;
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(Boolean(passwordError));

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
            {clientName.trim().charAt(0)}
          </span>
          <h1 className="text-2xl font-bold text-blue-950">{clientName}</h1>
        </div>
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
      {passwordSuccess && <p className="mt-2 text-sm text-green-700">הסיסמה עודכנה בהצלחה.</p>}
      {passwordError && <p className="mt-2 text-sm text-red-600">{PASSWORD_ERROR_MESSAGES[passwordError] ?? "אירעה שגיאה."}</p>}
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
