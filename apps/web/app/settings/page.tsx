import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppSettings, updateMetaSettingsFromForm } from "@/lib/actions/settings";
import { TokenField } from "@/components/token-field";
import type { Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, { data: clients }] = await Promise.all([
    getAppSettings(),
    supabaseAdmin().from("clients").select("id, name, meta_ad_account_id").order("name"),
  ]);
  const clientRows = (clients ?? []) as Pick<Client, "id" | "name" | "meta_ad_account_id">[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <form action={updateMetaSettingsFromForm} className="card space-y-4">
        <h2 className="font-semibold">חיבור Meta Ads</h2>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="mb-2 font-medium">איך ליצור System User Token:</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              היכנס ל-
              <a href="https://business.facebook.com/settings" target="_blank" rel="noreferrer" className="underline">
                Meta Business Settings
              </a>
            </li>
            <li>Users ← System Users ← בחר משתמש מערכת קיים או צור חדש</li>
            <li>Generate New Token ← בחר את האפליקציה ← סמן הרשאות ads_management ו-ads_read</li>
            <li>העתק את הטוקן שנוצר (מוצג פעם אחת בלבד) והדבק כאן</li>
            <li>
              ודא שכל חשבון פרסום של לקוח מחובר כ-partner תחת אותו Business Manager, ושה-Ad Account ID שלו מוגדר בעריכת
              הלקוח
            </li>
          </ol>
        </div>
        <div>
          <label className="label" htmlFor="meta_system_user_token">
            System User Token
          </label>
          <TokenField name="meta_system_user_token" defaultValue={settings?.meta_system_user_token ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="meta_business_id">
            Business Manager ID (אופציונלי, לתיעוד)
          </label>
          <input className="input" id="meta_business_id" name="meta_business_id" defaultValue={settings?.meta_business_id ?? ""} />
        </div>
        <button type="submit" className="btn btn-primary">
          שמור
        </button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">חשבונות פרסום של לקוחות</h2>
        {clientRows.length === 0 && <p className="text-slate-500">אין עדיין לקוחות.</p>}
        <ul className="space-y-1 text-sm">
          {clientRows.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-slate-500">{c.meta_ad_account_id ?? "לא הוגדר"}</span>
                <Link href={`/clients/${c.id}/edit`} className="text-slate-600 underline">
                  ערוך
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
