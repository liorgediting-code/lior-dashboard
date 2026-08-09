import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const SOP_LABELS = ["תשלום אושר", "שאלון מולא", "שיחת אסטרטגיה", "בניית אסטרטגיה", "תסריטים", "צילום", "בניית קמפיין", "הרצה", "ניהול שוטף"];

export default async function ClientsPage() {
  const supabase = supabaseAdmin();
  const { data: clients } = await supabase.from("clients").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">לקוחות</h1>
        <Link href="/clients/new" className="btn btn-primary">
          + לקוח חדש
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {((clients ?? []) as Client[]).map((client) => (
          <Link key={client.id} href={`/clients/${client.id}`} className="card block hover:border-slate-400">
            <div className="mb-1 text-lg font-semibold">{client.name}</div>
            <div className="mb-3 text-sm text-slate-500">{client.business_type}</div>
            <div className="badge bg-slate-100 text-slate-700">
              שלב {client.sop_stage}: {SOP_LABELS[client.sop_stage]}
            </div>
          </Link>
        ))}
        {(clients ?? []).length === 0 && <p className="text-slate-500">אין עדיין לקוחות. צור לקוח חדש כדי להתחיל.</p>}
      </div>
    </div>
  );
}
