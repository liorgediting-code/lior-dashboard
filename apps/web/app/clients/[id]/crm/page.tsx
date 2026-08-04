import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { LeadCard } from "@/components/lead-card";
import { createLead } from "@/lib/actions/leads";
import { redirect } from "next/navigation";
import type { Lead, LeadStage } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const COLUMNS: { stage: LeadStage; label: string }[] = [
  { stage: "new", label: "חדש" },
  { stage: "contacted", label: "נוצר קשר" },
  { stage: "qualified", label: "מוכשר" },
  { stage: "won", label: "נסגר" },
  { stage: "lost", label: "אבוד" },
];

async function createLeadAction(clientId: string, formData: FormData) {
  "use server";
  await createLead({
    client_id: clientId,
    name: String(formData.get("name") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
  });
  redirect(`/clients/${clientId}/crm`);
}

export default async function ClientCrmPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("leads").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (!client) notFound();

  const leadRows = (leads ?? []) as Lead[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="crm" />

      <form action={createLeadAction.bind(null, params.id)} className="card mb-6 flex flex-wrap gap-3">
        <input className="input flex-1" name="name" placeholder="שם הליד" />
        <input className="input flex-1" name="phone" placeholder="טלפון" />
        <button type="submit" className="btn btn-primary">
          + הוסף ליד ידנית
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div key={col.stage}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              {col.label} ({leadRows.filter((l) => l.stage === col.stage).length})
            </h2>
            <div className="space-y-2">
              {leadRows
                .filter((l) => l.stage === col.stage)
                .map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
