import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateClientFromForm } from "@/lib/actions/clients";
import { createClientPaymentFromForm, deleteClientPayment } from "@/lib/actions/client-payments";
import type { Client, ClientPayment } from "@dashboard-lior/shared";
import { DriveLinksEditor } from "@/components/drive-links-editor";
import { CreateCrmPanel } from "@/components/create-crm-panel";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: payments }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("client_payments").select("*").eq("client_id", params.id).order("paid_on", { ascending: false }),
  ]);
  if (!client) notFound();
  const c = client as Client;
  const paymentRows = (payments ?? []) as ClientPayment[];

  const action = updateClientFromForm.bind(null, c.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">עריכת {c.name}</h1>
      <form action={action} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="label" htmlFor="name">
              שם העסק
            </label>
            <input className="input" id="name" name="name" defaultValue={c.name} required />
          </div>
          <div>
            <label className="label" htmlFor="business_type">
              סוג עסק
            </label>
            <select className="input" id="business_type" name="business_type" defaultValue={c.business_type}>
              <option value="local_service">שירות מקומי</option>
              <option value="ecommerce">איקומרס</option>
              <option value="coaching_consulting">קואצ׳ינג / ייעוץ</option>
              <option value="real_estate">נדל״ן</option>
              <option value="clinic_medical">מרפאה / רפואי</option>
              <option value="other">אחר</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="phone">
              טלפון
            </label>
            <input className="input" id="phone" name="phone" defaultValue={(c.contact_info as { phone?: string })?.phone ?? ""} />
          </div>
        </div>

        <div className="card grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="deal_price_avg">
              מחיר עסקה ממוצע (₪)
            </label>
            <input className="input" id="deal_price_avg" name="deal_price_avg" type="number" step="any" defaultValue={c.deal_price_avg ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="close_rate_pct">
              אחוז סגירה (%)
            </label>
            <input className="input" id="close_rate_pct" name="close_rate_pct" type="number" step="any" defaultValue={c.close_rate_pct ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="monthly_revenue">
              הכנסה חודשית (₪)
            </label>
            <input className="input" id="monthly_revenue" name="monthly_revenue" type="number" step="any" defaultValue={c.monthly_revenue ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="deals_per_month">
              עסקאות בחודש
            </label>
            <input className="input" id="deals_per_month" name="deals_per_month" type="number" step="any" defaultValue={c.deals_per_month ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="price_range_low">
              טווח מחיר נמוך (₪)
            </label>
            <input className="input" id="price_range_low" name="price_range_low" type="number" step="any" defaultValue={c.price_range_low ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="price_range_high">
              טווח מחיר גבוה (₪)
            </label>
            <input className="input" id="price_range_high" name="price_range_high" type="number" step="any" defaultValue={c.price_range_high ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="profit_ratio">
              יחס רווחיות
            </label>
            <input className="input" id="profit_ratio" name="profit_ratio" type="number" step="any" defaultValue={c.profit_ratio} />
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">CRM ללקוח</h2>
          <p className="text-sm text-slate-500">
            {c.crm_password_hash && c.webhook_secret
              ? "ל-CRM הזה יש גישת פורטל וכתובת webhook פעילות."
              : "עדיין לא נוצר CRM ללקוח הזה."}
          </p>
          <CreateCrmPanel
            clientId={c.id}
            clientName={c.name}
            appBaseUrl={process.env.APP_BASE_URL ?? ""}
            hasPassword={Boolean(c.crm_password_hash)}
            hasWebhook={Boolean(c.webhook_secret)}
            webhookSecret={c.webhook_secret}
            passwordResetRequestedAt={c.password_reset_requested_at}
          />
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">חיבור Meta Ads</h2>
          <p className="text-sm text-slate-500">
            הטוקן המערכתי מוגדר במסך <a href="/settings" className="underline">ההגדרות</a>. כאן קובעים רק לאיזה חשבון פרסום
            של הלקוח הזה להתחבר.
          </p>
          <div>
            <label className="label" htmlFor="meta_ad_account_id">
              Ad Account ID
            </label>
            <input
              className="input font-mono"
              id="meta_ad_account_id"
              name="meta_ad_account_id"
              placeholder="act_1234567890"
              defaultValue={c.meta_ad_account_id ?? ""}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">כפתורי Drive</h2>
          <DriveLinksEditor name="drive_links" defaultValue={c.drive_links ?? []} />
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">תיקיית וידאו ב-Drive</h2>
          <p className="text-sm text-slate-500">
            תיקייה אחת לכל לקוח, משותפת ב״כל מי שיש לו הקישור״. הסרטונים מתוכה נמשכים אוטומטית ללשונית{" "}
            <a href={`/clients/${c.id}/videos`} className="underline">
              וידאו
            </a>{" "}
            — אין צורך להעלות כלום.
          </p>
          <div>
            <label className="label" htmlFor="drive_folder_id">
              קישור לתיקייה (או מזהה)
            </label>
            <input
              className="input font-mono"
              id="drive_folder_id"
              name="drive_folder_id"
              dir="ltr"
              placeholder="https://drive.google.com/drive/folders/..."
              defaultValue={c.drive_folder_id ?? ""}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">הקלטה ותמלול שיחת אסטרטגיה</h2>
          <p className="text-sm text-slate-500">שדה חובה לפני אישור Gate 1.</p>
          <div>
            <label className="label" htmlFor="strategy_call_recording_url">
              קישור להקלטה
            </label>
            <input className="input" id="strategy_call_recording_url" name="strategy_call_recording_url" defaultValue={c.strategy_call_recording_url ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="strategy_call_transcript_url">
              קישור לתמלול
            </label>
            <input
              className="input"
              id="strategy_call_transcript_url"
              name="strategy_call_transcript_url"
              defaultValue={c.strategy_call_transcript_url ?? ""}
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary">
          שמור
        </button>
      </form>

      <div className="card mt-6 space-y-3">
        <h2 className="font-semibold">תשלומים</h2>
        <div className="space-y-1">
          {paymentRows.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span>
                {p.paid_on} — {formatCurrency(p.amount)} {p.note && <span className="text-slate-400">· {p.note}</span>}
              </span>
              <form action={deleteClientPayment.bind(null, p.id, c.id)}>
                <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                  הסר
                </button>
              </form>
            </div>
          ))}
          {paymentRows.length === 0 && <p className="text-slate-500">אין עדיין תשלומים רשומים.</p>}
        </div>
        <form action={createClientPaymentFromForm.bind(null, c.id)} className="flex flex-wrap gap-2">
          <input className="input w-28" name="amount" type="number" step="any" min="0" placeholder="סכום (₪)" required />
          <input className="input w-40" name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <input className="input flex-1" name="note" placeholder="הערה (אופציונלי)" />
          <button type="submit" className="btn btn-secondary text-sm">
            + הוסף תשלום
          </button>
        </form>
      </div>
    </div>
  );
}
