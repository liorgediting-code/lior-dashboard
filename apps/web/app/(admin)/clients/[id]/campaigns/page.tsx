import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CampaignStatsTable, type StatsRow } from "@/components/campaign-stats-table";
import { fetchCampaignStats, fetchCampaignsForClient } from "@/lib/metrics/fetch-stats";
import { trailingDays } from "@/lib/metrics/campaign-stats";
import type { Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function ClientCampaignsPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const range = trailingDays(WINDOW_DAYS);

  const [{ data: client }, campaigns] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    fetchCampaignsForClient(supabase, params.id),
  ]);
  if (!client) notFound();
  const c = client as Client;

  const stats = await fetchCampaignStats(
    supabase,
    campaigns.map((campaign) => campaign.id),
    range
  );

  const isConnected = Boolean(c.meta_ad_account_id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{c.name}</h1>
      <ClientTabs clientId={c.id} active="campaigns" />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{WINDOW_DAYS} הימים האחרונים</p>
        <div className="flex items-center gap-2">
          <span className={isConnected ? "badge badge-winner" : "badge badge-insufficient"}>
            {isConnected ? `מחובר: ${c.meta_ad_account_id}` : "לא הוגדר חשבון פרסום"}
          </span>
          <Link href={`/clients/${c.id}/edit`} className="btn btn-secondary">
            ערוך חשבון פרסום
          </Link>
          <Link href="/settings" className="btn btn-secondary">
            הגדרות Meta
          </Link>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-3 font-semibold">סיכום לפי קמפיין</h2>
          <CampaignStatsTable
            rows={campaigns.map((campaign) => ({
              key: campaign.id,
              label: campaign.name,
              sublabel: [campaign.funnel_stage, campaign.status].filter(Boolean).join(" · ") || undefined,
              stats: stats.byCampaign(campaign.id),
            }))}
            totalLabel="סה״כ ללקוח"
          />
        </div>
      )}

      <div className="space-y-6">
        {campaigns.map((campaign) => {
          const campaignAdsets = stats.adsets.filter((adset) => adset.campaign_id === campaign.id);

          return (
            <div key={campaign.id} className="card">
              <h2 className="mb-3 font-semibold">
                {campaign.name} {campaign.funnel_stage && <span className="badge badge-insufficient">{campaign.funnel_stage}</span>}
              </h2>
              {campaignAdsets.map((adset) => {
                const adRows: StatsRow[] = stats.ads
                  .filter((ad) => ad.adset_id === adset.id)
                  .map((ad) => ({ key: ad.id, label: ad.name, sublabel: ad.status ?? undefined, stats: stats.byAd(ad.id) }));

                return (
                  <div key={adset.id} className="mb-4 border-r-2 border-slate-200 pr-3">
                    <h3 className="mb-2 text-sm font-medium text-slate-700">{adset.name}</h3>
                    <CampaignStatsTable rows={adRows} totalLabel="סה״כ בקבוצה" entityLabel="מודעה" emptyLabel="אין מודעות בקבוצה." />
                  </div>
                );
              })}
              {campaignAdsets.length === 0 && <p className="text-sm text-slate-500">אין קבוצות מודעות מסונכרנות בקמפיין הזה.</p>}
            </div>
          );
        })}

        {campaigns.length === 0 && (
          <p className="text-slate-500">
            אין עדיין קמפיינים מסונכרנים. חבר את חשבון ה-Meta Ads ולחץ &quot;סנכרן&quot; (cron יומי) כדי למשוך נתונים.
          </p>
        )}
      </div>
    </div>
  );
}
