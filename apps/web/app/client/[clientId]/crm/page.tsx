import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import { CrmDashboardStats } from "@/components/crm-dashboard-stats";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { resolveLeadSources } from "@/lib/crm/lead-sources";
import { fetchActivitiesByLead } from "@/lib/crm/fetch-activities";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { resolveColumnLayout } from "@/lib/crm/column-layout";
import type { Lead, LeadStatus, LeadColumn, CrmColumnLayoutEntry, PortalThemeColor } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalCrmPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { password_success?: string; password_error?: string };
}) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("id, name, crm_column_layout, portal_theme_color").eq("id", params.clientId).single(),
    supabase.from("leads").select("*").eq("client_id", params.clientId).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.clientId),
    supabase.from("lead_columns").select("*").eq("client_id", params.clientId),
  ]);
  if (!client) notFound();
  const leadRows = (leads ?? []) as Lead[];
  const columnRows = (columns ?? []) as LeadColumn[];
  const columnLayout = resolveColumnLayout(client.crm_column_layout as CrmColumnLayoutEntry[] | null, columnRows);
  const [sourceLabels, activitiesByLeadId, tabsData] = await Promise.all([
    resolveLeadSources(supabase, leadRows),
    fetchActivitiesByLead(supabase, params.clientId),
    getPortalTabsData(supabase, params.clientId),
  ]);

  return (
    <div>
      <ClientPortalHeader
        clientId={params.clientId}
        clientName={client.name as string}
        passwordSuccess={searchParams.password_success === "1"}
        passwordError={searchParams.password_error}
      />
      <PortalTabs clientId={params.clientId} active="crm" {...tabsData} />
      <CrmDashboardStats leads={leadRows} statuses={(statuses ?? []) as LeadStatus[]} />
      <CrmManagePanel
        clientId={params.clientId}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={columnRows}
        columnLayout={columnLayout}
        themeColor={client.portal_theme_color as PortalThemeColor | null}
      />
      <CrmTable
        clientId={params.clientId}
        leads={leadRows}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={columnRows}
        columnLayout={columnLayout}
        sourceLabels={sourceLabels}
        activitiesByLeadId={activitiesByLeadId}
        inlineEdit={false}
      />
    </div>
  );
}
