import { supabaseAdmin } from "@/lib/supabase/admin";
import { approveGateViaMagicLink } from "@/lib/sop/actions";

export const dynamic = "force-dynamic";

async function approveAction(token: string) {
  "use server";
  await approveGateViaMagicLink(token);
}

export default async function ApproveGatePage({ params }: { params: { token: string } }) {
  const supabase = supabaseAdmin();
  const { data: link } = await supabase.from("magic_links").select("*, clients(name)").eq("token", params.token).maybeSingle();

  if (!link) {
    return <p className="mx-auto max-w-md pt-20 text-center text-slate-600">קישור לא נמצא.</p>;
  }

  const clientName = (link.clients as { name: string } | null)?.name ?? "הלקוח";
  const expired = new Date(link.expires_at as string) < new Date();
  const used = Boolean(link.used_at);

  return (
    <div className="mx-auto max-w-md pt-20 text-center">
      <h1 className="mb-2 text-xl font-bold">אישור שלב עבור {clientName}</h1>
      <p className="mb-6 text-slate-600">Gate {link.gate_number as number}</p>

      {used && <p className="text-green-700">הקישור הזה כבר נוצל, השלב אושר.</p>}
      {!used && expired && <p className="text-red-600">הקישור פג תוקף, יש לבקש קישור חדש מהסוכנות.</p>}
      {!used && !expired && (
        <form action={approveAction.bind(null, params.token)}>
          <button type="submit" className="btn btn-primary">
            אני מאשר/ת ✅
          </button>
        </form>
      )}
    </div>
  );
}
