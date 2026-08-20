import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import { CrmDashboardStats } from "@/components/crm-dashboard-stats";
import { CampaignCrmDashboard } from "@/components/campaign-crm-dashboard";
import { CRM_CAMPAIGN_WINDOW_DAYS, fetchCrmCampaignDashboard } from "@/lib/metrics/crm-campaigns";
import { resolveLeadSources } from "@/lib/crm/lead-sources";
import { fetchActivitiesByLead } from "@/lib/crm/fetch-activities";
import { suggestUnmappedKeys } from "@/lib/crm/webhook-mapping";
import { resolveColumnLayout } from "@/lib/crm/column-layout";
import type { Lead, LeadStatus, LeadColumn, WebhookFieldMapping, CrmColumnLayoutEntry, PortalThemeColor } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientCrmPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }, { data: mappings }] = await Promise.all([
    supabase.from("clients").select("id, name, crm_column_layout, portal_theme_color").eq("id", params.id).single(),
    supabase.from("leads").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.id),
    supabase.from("lead_columns").select("*").eq("client_id", params.id),
    supabase.from("webhook_field_mappings").select("*").eq("client_id", params.id).order("source_key"),
  ]);
  if (!client) notFound();
  const leadRows = (leads ?? []) as Lead[];
  const columnRows = (columns ?? []) as LeadColumn[];
  const mappingRows = (mappings ?? []) as WebhookFieldMapping[];
  const columnLayout = resolveColumnLayout(client.crm_column_layout as CrmColumnLayoutEntry[] | null, columnRows);
  const [sourceLabels, activitiesByLeadId, pinnedCampaigns] = await Promise.all([
    resolveLeadSources(supabase, leadRows),
    fetchActivitiesByLead(supabase, params.id),
    fetchCrmCampaignDashboard(supabase, { clientId: params.id }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="crm" />
      <CrmDashboardStats leads={leadRows} statuses={(statuses ?? []) as LeadStatus[]} />
      <CampaignCrmDashboard campaigns={pinnedCampaigns} windowDays={CRM_CAMPAIGN_WINDOW_DAYS} manageHref="/campaigns" />
      <CrmManagePanel
        clientId={params.id}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={columnRows}
        columnLayout={columnLayout}
        themeColor={client.portal_theme_color as PortalThemeColor | null}
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
        columnLayout={columnLayout}
        sourceLabels={sourceLabels}
        activitiesByLeadId={activitiesByLeadId}
      />
    </div>
  );
}
