import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loginClientAction } from "@/lib/actions/client-auth";

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { error?: string };
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
    </div>
  );
}
