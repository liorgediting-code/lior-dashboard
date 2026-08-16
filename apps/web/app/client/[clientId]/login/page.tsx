import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loginClientAction, requestClientPasswordResetAction } from "@/lib/actions/client-auth";

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { error?: string; requested?: string };
}) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", params.clientId).maybeSingle();
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-sm pt-24">
      <h1 className="mb-6 text-center text-xl font-bold">כניסה לאזור הלקוח — {client.name as string}</h1>
      <form action={loginClientAction.bind(null, params.clientId)} className="card space-y-3">
        <input className="input" type="password" name="password" placeholder="סיסמה" required autoFocus />
        {searchParams.error && <p className="text-sm text-red-600">סיסמה שגויה.</p>}
        <button type="submit" className="btn btn-primary w-full">
          כניסה
        </button>
      </form>
      {searchParams.requested ? (
        <p className="mt-3 text-center text-sm text-green-700">הבקשה נשלחה — ניצור איתך קשר עם סיסמה חדשה בהקדם.</p>
      ) : (
        <form action={requestClientPasswordResetAction.bind(null, params.clientId)} className="mt-3 text-center">
          <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-700">
            שכחת סיסמה?
          </button>
        </form>
      )}
    </div>
  );
}
