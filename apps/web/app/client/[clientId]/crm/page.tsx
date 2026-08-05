import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import { ClientPortalHeader } from "@/components/client-portal-header";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalCrmPage({ params }: { params: { clientId: string } }) {
  requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    supabase.from("leads").select("*").eq("client_id", params.clientId).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.clientId),
    supabase.from("lead_columns").select("*").eq("client_id", params.clientId),
  ]);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <CrmManagePanel clientId={params.clientId} statuses={(statuses ?? []) as LeadStatus[]} columns={(columns ?? []) as LeadColumn[]} />
      <CrmTable
        clientId={params.clientId}
        leads={(leads ?? []) as Lead[]}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={(columns ?? []) as LeadColumn[]}
      />
    </div>
  );
}
