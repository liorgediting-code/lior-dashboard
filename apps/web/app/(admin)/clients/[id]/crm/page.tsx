import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import { CrmDashboardStats } from "@/components/crm-dashboard-stats";
import { resolveLeadSources } from "@/lib/crm/lead-sources";
import { fetchActivitiesByLead } from "@/lib/crm/fetch-activities";
import { suggestUnmappedKeys } from "@/lib/crm/webhook-mapping";
import type { Lead, LeadStatus, LeadColumn, WebhookFieldMapping } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientCrmPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }, { data: mappings }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("leads").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.id),
    supabase.from("lead_columns").select("*").eq("client_id", params.id),
    supabase.from("webhook_field_mappings").select("*").eq("client_id", params.id).order("source_key"),
  ]);
  if (!client) notFound();
  const leadRows = (leads ?? []) as Lead[];
  const columnRows = (columns ?? []) as LeadColumn[];
  const mappingRows = (mappings ?? []) as WebhookFieldMapping[];
  const [sourceLabels, activitiesByLeadId] = await Promise.all([
    resolveLeadSources(supabase, leadRows),
    fetchActivitiesByLead(supabase, params.id),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="crm" />
      <CrmDashboardStats leads={leadRows} statuses={(statuses ?? []) as LeadStatus[]} />
      <CrmManagePanel
        clientId={params.id}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={columnRows}
        webhook={{
          mappings: mappingRows,
          suggestedKeys: suggestUnmappedKeys(
            leadRows.map((lead) => lead.custom_fields),
            mappingRows,
            new Set(columnRows.map((column) => column.id))
          ),
        }}
      />
      <CrmTable
        clientId={params.id}
        leads={leadRows}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={columnRows}
        sourceLabels={sourceLabels}
        activitiesByLeadId={activitiesByLeadId}
      />
    </div>
  );
}
