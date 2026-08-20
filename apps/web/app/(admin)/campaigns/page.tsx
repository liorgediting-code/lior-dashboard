import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CampaignCrmToggles } from "@/components/campaign-crm-toggles";
import { fetchAllCampaigns, fetchCampaignStats } from "@/lib/metrics/fetch-stats";
import { trailingDays } from "@/lib/metrics/campaign-stats";
import { campaignActivity, formatCampaignStatus, type CampaignActivity } from "@/lib/metrics/campaign-status";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

type Filter = CampaignActivity | "all";
type Sort = "spend" | "name" | "client" | "cpl" | "leads";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "active", label: "פעילים" },
  { key: "inactive", label: "לא פעילים" },
  { key: "all", label: "הכל" },
];

const SORTS: Array<{ key: Sort; label: string }> = [
  { key: "spend", label: "הוצאה" },
  { key: "leads", label: "לידים" },
  { key: "cpl", label: "CPL" },
  { key: "name", label: "שם" },
  { key: "client", label: "לקוח" },
];

function parseFilter(value: string | undefined): Filter {
  return value === "inactive" || value === "all" ? value : "active";
}

function parseSort(value: string | undefined): Sort {
  return SORTS.some((sort) => sort.key === value) ? (value as Sort) : "spend";
}

export default async function CampaignsPage({ searchParams }: { searchParams: { status?: string; sort?: string } }) {
  const filter = parseFilter(searchParams.status);
  const sort = parseSort(searchParams.sort);

  const supabase = supabaseAdmin();
  const range = trailingDays(WINDOW_DAYS);
  const campaigns = await fetchAllCampaigns(supabase);
  const stats = await fetchCampaignStats(
    supabase,
    campaigns.map((campaign) => campaign.id),
    range
  );

  const rows = campaigns
    .map((campaign) => ({
      campaign,
      activity: campaignActivity(campaign.status),
      stats: stats.byCampaign(campaign.id),
    }))
    .filter((row) => filter === "all" || row.activity === filter)
    .sort((a, b) => {
      switch (sort) {
        case "name":
          return a.campaign.name.localeCompare(b.campaign.name, "he");
        case "client":
          return a.campaign.clientName.localeCompare(b.campaign.clientName, "he") || a.campaign.name.localeCompare(b.campaign.name, "he");
        case "leads":
          return b.stats.leads - a.stats.leads;
        case "cpl":
          // Campaigns with no leads have no CPL — they sort last rather than
          // heading the list as if they were the cheapest.
          return (a.stats.cpl ?? Number.POSITIVE_INFINITY) - (b.stats.cpl ?? Number.POSITIVE_INFINITY);
        default:
          return b.stats.spend - a.stats.spend;
      }
    });

  const counts = {
    active: campaigns.filter((campaign) => campaignActivity(campaign.status) === "active").length,
    inactive: campaigns.filter((campaign) => campaignActivity(campaign.status) === "inactive").length,
    all: campaigns.length,
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">קמפיינים</h1>
      <p className="mb-4 text-sm text-slate-500">
        כל הקמפיינים של כל הלקוחות · {WINDOW_DAYS} הימים האחרונים · סמנו קמפיין כדי שהדשבורד שלו יופיע ב-CRM
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {FILTERS.map((option) => (
            <Link
              key={option.key}
              href={`/campaigns?status=${option.key}&sort=${sort}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === option.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option.label} ({counts[option.key]})
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 text-sm text-slate-500 md:ms-auto">
          <span>מיון:</span>
          {SORTS.map((option) => (
            <Link
              key={option.key}
              href={`/campaigns?status=${filter}&sort=${option.key}`}
              className={`rounded px-2 py-1 ${sort === option.key ? "bg-slate-200 font-medium text-slate-800" : "hover:bg-slate-100"}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {campaigns.length === 0
              ? "אין עדיין קמפיינים מסונכרנים. חברו חשבון Meta Ads ללקוח והריצו את הסנכרון היומי."
              : "אין קמפיינים בסינון הזה."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="text-right text-slate-500">
                  <th className="pb-1 font-normal">קמפיין</th>
                  <th className="pb-1 font-normal">לקוח</th>
                  <th className="pb-1 font-normal">סטטוס</th>
                  <th className="pb-1 font-normal">הוצאה</th>
                  <th className="pb-1 font-normal">לידים</th>
                  <th className="pb-1 font-normal">CPL</th>
                  <th className="pb-1 font-normal">CTR</th>
                  <th className="pb-1 font-normal">חשיפות</th>
                  <th className="pb-1 font-normal">מוצג ב-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ campaign, activity, stats: campaignStats }) => (
                  <tr key={campaign.id}>
                    <td className="py-2">
                      <Link href={`/clients/${campaign.client_id}/campaigns`} className="font-medium hover:underline">
                        {campaign.name}
                      </Link>
                      {campaign.funnel_stage && <span className="block text-xs text-slate-400">{campaign.funnel_stage}</span>}
                    </td>
                    <td className="py-2">
                      <Link href={`/clients/${campaign.client_id}`} className="hover:underline">
                        {campaign.clientName}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span className={activity === "active" ? "badge badge-winner" : "badge badge-insufficient"}>
                        {formatCampaignStatus(campaign.status)}
                      </span>
                    </td>
                    <td className="py-2">{formatCurrency(campaignStats.spend)}</td>
                    <td className="py-2">{formatNumber(campaignStats.leads)}</td>
                    <td className="py-2">{formatCurrency(campaignStats.cpl)}</td>
                    <td className="py-2">{formatPercent(campaignStats.ctr)}</td>
                    <td className="py-2">{formatNumber(campaignStats.impressions)}</td>
                    <td className="py-2">
                      <CampaignCrmToggles
                        campaignId={campaign.id}
                        clientName={campaign.clientName}
                        showInAgencyCrm={campaign.show_in_agency_crm}
                        showInClientCrm={campaign.show_in_client_crm}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
