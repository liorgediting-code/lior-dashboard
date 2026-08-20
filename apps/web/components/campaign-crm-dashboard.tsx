import Link from "next/link";
import { CampaignStatsTable } from "@/components/campaign-stats-table";
import { formatCampaignStatus } from "@/lib/metrics/campaign-status";
import type { CampaignStats } from "@/lib/metrics/campaign-stats";

export type CrmDashboardCampaign = {
  id: string;
  name: string;
  clientName: string;
  status: string | null;
  funnelStage: string | null;
  stats: CampaignStats;
};

/**
 * The campaign dashboard embedded in a CRM. Same table as the campaigns tab
 * so a campaign never shows two different CPLs in two places.
 *
 * Renders nothing at all when no campaign is pinned — an empty card on every
 * CRM would be permanent noise for the (many) clients who never pin one.
 * `showClientColumn` is for /agency-crm, where rows span several clients.
 */
export function CampaignCrmDashboard({
  campaigns,
  windowDays,
  showClientColumn = false,
  manageHref,
}: {
  campaigns: CrmDashboardCampaign[];
  windowDays: number;
  showClientColumn?: boolean;
  /** Link to /campaigns. Omitted in the client portal, which has no such page. */
  manageHref?: string;
}) {
  if (campaigns.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">דשבורד קמפיינים</h2>
          <p className="text-xs text-slate-500">{windowDays} הימים האחרונים</p>
        </div>
        {manageHref && (
          <Link href={manageHref} className="text-xs text-blue-700 hover:underline">
            ניהול קמפיינים
          </Link>
        )}
      </div>

      <CampaignStatsTable
        rows={campaigns.map((campaign) => ({
          key: campaign.id,
          label: campaign.name,
          sublabel: [showClientColumn ? campaign.clientName : null, campaign.funnelStage, formatCampaignStatus(campaign.status)]
            .filter(Boolean)
            .join(" · "),
          stats: campaign.stats,
        }))}
        totalLabel="סה״כ"
      />
    </div>
  );
}
