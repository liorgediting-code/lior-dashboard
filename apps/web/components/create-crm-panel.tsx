"use client";

import { useState } from "react";
import { regenerateClientPasswordAction, enterAsClientAction } from "@/lib/actions/client-auth";
import { regenerateWebhookSecretAction } from "@/lib/actions/client-webhook";

function buildAutomationPrompt(clientName: string, webhookUrl: string) {
  return `אני רוצה לחבר אוטומציה (Make.com / Zapier / n8n / Claude Code) שתכניס לידים חדשים ל-CRM של הלקוח "${clientName}".

כתובת ה-Webhook (POST בלבד):
${webhookUrl}

גוף הבקשה — JSON, לדוגמה:
{
  "name": "שם הליד",
  "phone": "050-1234567",
  "email": "lead@example.com",
  "any_other_field": "ערך חופשי"
}

חוקי המיפוי:
- name / full_name -> שם הליד
- phone / phone_number -> טלפון
- email -> אימייל
- כל שדה אחר שנשלח נשמר כשדה מותאם אישית על הליד (custom_fields), בלי צורך בהגדרה מראש.

תגובה בהצלחה: {"ok": true, "leadId": "..."} עם סטטוס 200.
תגובה בשגיאת אימות (secret שגוי/חסר): {"error": "unauthorized"} עם סטטוס 401.

דוגמת curl לבדיקה:
curl -X POST "${webhookUrl}" -H "Content-Type: application/json" -d '{"name":"בדיקה","phone":"0500000000"}'`;
}

export function CreateCrmPanel({
  clientId,
  clientName,
  appBaseUrl,
  hasPassword,
  hasWebhook,
  webhookSecret,
}: {
  clientId: string;
  clientName: string;
  appBaseUrl: string;
  hasPassword: boolean;
  hasWebhook: boolean;
  /** Stored in plaintext (unlike the password), so it can be shown again anytime — not just right after creation. */
  webhookSecret?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ password: string; webhookSecret: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    const [password, webhookSecret] = await Promise.all([
      regenerateClientPasswordAction(clientId),
      regenerateWebhookSecretAction(clientId),
    ]);
    setResult({ password, webhookSecret });
    setPending(false);
  }

  async function copy(text: string, which: string) {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  const portalUrl = `${appBaseUrl}/client/${clientId}/login`;
  const webhookUrl = result
    ? `${appBaseUrl}/api/webhooks/leads/${clientId}?secret=${result.webhookSecret}`
    : webhookSecret
      ? `${appBaseUrl}/api/webhooks/leads/${clientId}?secret=${webhookSecret}`
      : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {hasPassword && hasWebhook
          ? "ל־CRM הזה כבר יש סיסמה וכתובת webhook פעילות. לחיצה כאן יוצרת חדשות ומבטלת את הישנות."
          : "לחיצה אחת יוצרת גישה לפורטל הלקוח וכתובת webhook להכנסת לידים אוטומטית — הכל יחד."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={handleClick}>
          {pending ? "יוצר..." : hasPassword || hasWebhook ? "רענן CRM ללקוח (סיסמה + webhook חדשים)" : "צור CRM ללקוח"}
        </button>
        {hasPassword && (
          <button type="button" className="btn btn-secondary" onClick={() => enterAsClientAction(clientId)}>
            כניסה כלקוח 🔑
          </button>
        )}
      </div>

      {result && webhookUrl && (
        <div className="space-y-4 rounded-lg bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">מוצג פעם אחת בלבד — העתק/שמור עכשיו לפני שתעזוב את הדף.</p>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium">קישור + סיסמה לפורטל הלקוח:</p>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => copy(`${portalUrl}\n${result.password}`, "portal")}>
                {copied === "portal" ? "הועתק ✓" : "העתק"}
              </button>
            </div>
            <code className="block break-all font-mono text-xs">{portalUrl}</code>
            <code className="block break-all font-mono text-xs">סיסמה: {result.password}</code>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium">כתובת ה-Webhook להכנסת לידים:</p>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => copy(webhookUrl, "url")}>
                {copied === "url" ? "הועתק ✓" : "העתק"}
              </button>
            </div>
            <code className="break-all font-mono text-xs">{webhookUrl}</code>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium">פרומפט מוכן להעתקה ל-Claude Code / Make.com:</p>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => copy(buildAutomationPrompt(clientName, webhookUrl), "prompt")}
              >
                {copied === "prompt" ? "הועתק ✓" : "העתק"}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-xs">
              {buildAutomationPrompt(clientName, webhookUrl)}
            </pre>
          </div>
        </div>
      )}

      {!result && webhookUrl && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium">כתובת ה-Webhook להכנסת לידים:</p>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => copy(webhookUrl, "url")}>
                {copied === "url" ? "הועתק ✓" : "העתק"}
              </button>
            </div>
            <code className="break-all font-mono text-xs">{webhookUrl}</code>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium">פרומפט מוכן להעתקה ל-Claude Code / Make.com:</p>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => copy(buildAutomationPrompt(clientName, webhookUrl), "prompt")}
              >
                {copied === "prompt" ? "הועתק ✓" : "העתק"}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-xs">
              {buildAutomationPrompt(clientName, webhookUrl)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
