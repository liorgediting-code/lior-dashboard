import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { CampaignStatsTable } from "@/components/campaign-stats-table";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { CRM_CAMPAIGN_WINDOW_DAYS, fetchCrmCampaignDashboard } from "@/lib/metrics/crm-campaigns";
import { deriveStats, sumTotals } from "@/lib/metrics/campaign-stats";
import { formatCampaignStatus } from "@/lib/metrics/campaign-status";
import { formatCurrency, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

/**
 * The client's own campaign results. Reads the same pinned set as the CRM
 * dashboard (fetchCrmCampaignDashboard scopes by client_id AND the
 * show_in_client_crm flag), so a campaign the agency did not pick can never
 * appear here.
 */
export default async function ClientPortalCampaignsPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, tabsData, campaigns] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    getPortalTabsData(supabase, params.clientId),
    fetchCrmCampaignDashboard(supabase, { clientId: params.clientId }),
  ]);
  if (!client) notFound();

  // Blended totals from summed counters — the mean of per-campaign costs is not the blended cost.
  const total = deriveStats(sumTotals(campaigns.map((campaign) => campaign.stats)));

  return (
    <div>
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <PortalTabs clientId={params.clientId} active="campaigns" {...tabsData} />

      <h1 className="mb-1 text-xl font-bold">קמפיינים</h1>
      <p className="mb-4 text-sm text-slate-500">התוצאות של {CRM_CAMPAIGN_WINDOW_DAYS} הימים האחרונים.</p>

      {campaigns.length === 0 ? (
        <p className="text-slate-500">עדיין אין קמפיינים להצגה.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="הוצאה" value={formatCurrency(total.spend)} />
            <Tile label="לידים" value={formatNumber(total.leads)} />
            <Tile label="עלות לתוצאה" value={formatCurrency(total.cpl)} />
            <Tile label="חשיפות" value={formatNumber(total.impressions)} />
          </div>

          <div className="card">
            <CampaignStatsTable
              rows={campaigns.map((campaign) => ({
                key: campaign.id,
                label: campaign.name,
                sublabel: [campaign.funnelStage, formatCampaignStatus(campaign.status)].filter(Boolean).join(" · "),
                stats: campaign.stats,
              }))}
              totalLabel="סה״כ"
            />
          </div>
        </>
      )}
    </div>
  );
}
