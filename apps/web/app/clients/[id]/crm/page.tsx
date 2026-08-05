import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientCrmPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("leads").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.id),
    supabase.from("lead_columns").select("*").eq("client_id", params.id),
  ]);
  if (!client) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="crm" />
      <CrmManagePanel clientId={params.id} statuses={(statuses ?? []) as LeadStatus[]} columns={(columns ?? []) as LeadColumn[]} />
      <CrmTable
        clientId={params.id}
        leads={(leads ?? []) as Lead[]}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={(columns ?? []) as LeadColumn[]}
      />
    </div>
  );
}
