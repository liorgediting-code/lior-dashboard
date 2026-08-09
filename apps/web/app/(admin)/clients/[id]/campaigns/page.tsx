import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Client, Campaign, AdSet, Ad, AdMetricDaily } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientCampaignsPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: campaigns }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("campaigns").select("*").eq("client_id", params.id),
  ]);
  if (!client) notFound();
  const c = client as Client;
  const campaignRows = (campaigns ?? []) as Campaign[];

  const campaignIds = campaignRows.map((cam) => cam.id);
  const { data: adsets } = campaignIds.length
    ? await supabase.from("adsets").select("*").in("campaign_id", campaignIds)
    : { data: [] as AdSet[] };
  const adsetRows = (adsets ?? []) as AdSet[];

  const adsetIds = adsetRows.map((a) => a.id);
  const { data: ads } = adsetIds.length ? await supabase.from("ads").select("*").in("adset_id", adsetIds) : { data: [] as Ad[] };
  const adRows = (ads ?? []) as Ad[];

  const adIds = adRows.map((a) => a.id);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: metrics } = adIds.length
    ? await supabase.from("ad_metrics_daily").select("*").in("ad_id", adIds).gte("date", since)
    : { data: [] as AdMetricDaily[] };

  const totalsByAd = new Map<string, { spend: number; leads: number }>();
  for (const m of (metrics ?? []) as AdMetricDaily[]) {
    const cur = totalsByAd.get(m.ad_id) ?? { spend: 0, leads: 0 };
    cur.spend += Number(m.spend);
    cur.leads += Number(m.leads);
    totalsByAd.set(m.ad_id, cur);
  }

  const isConnected = Boolean(c.meta_ad_account_id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{c.name}</h1>
      <ClientTabs clientId={c.id} active="campaigns" />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">30 הימים האחרונים</p>
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

      <div className="space-y-6">
        {campaignRows.map((campaign) => (
          <div key={campaign.id} className="card">
            <h2 className="mb-3 font-semibold">
              {campaign.name} <span className="badge badge-insufficient">{campaign.funnel_stage}</span>
            </h2>
            {adsetRows
              .filter((a) => a.campaign_id === campaign.id)
              .map((adset) => (
                <div key={adset.id} className="mb-4 border-r-2 border-slate-200 pr-3">
                  <h3 className="mb-2 text-sm font-medium text-slate-700">{adset.name}</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-slate-500">
                        <th className="pb-1 font-normal">מודעה</th>
                        <th className="pb-1 font-normal">Spend</th>
                        <th className="pb-1 font-normal">Leads</th>
                        <th className="pb-1 font-normal">CPL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {adRows
                        .filter((ad) => ad.adset_id === adset.id)
                        .map((ad) => {
                          const totals = totalsByAd.get(ad.id) ?? { spend: 0, leads: 0 };
                          const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;
                          return (
                            <tr key={ad.id}>
                              <td className="py-1">{ad.name}</td>
                              <td className="py-1">{formatCurrency(totals.spend)}</td>
                              <td className="py-1">{formatNumber(totals.leads)}</td>
                              <td className="py-1">{formatCurrency(cpl)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        ))}
        {campaignRows.length === 0 && (
          <p className="text-slate-500">אין עדיין קמפיינים מסונכרנים. חבר את חשבון ה-Meta Ads ולחץ &quot;סנכרן&quot; (cron יומי) כדי למשוך נתונים.</p>
        )}
      </div>
    </div>
  );
}
