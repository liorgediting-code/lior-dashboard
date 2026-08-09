import { supabaseAdmin } from "@/lib/supabase/admin";
import { FunnelForm, type CampaignOption } from "@/components/funnel-form";
import { createFunnelFromForm, updateFunnelFromForm, deleteFunnel } from "@/lib/actions/funnels";
import type { Campaign, Client, Funnel, FunnelCampaign, FunnelStatus } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<FunnelStatus, string> = {
  active: "פעיל",
  paused: "מושהה",
  archived: "בארכיון",
};

const STATUS_BADGE_CLASS: Record<FunnelStatus, string> = {
  active: "badge-winner",
  paused: "badge-insufficient",
  archived: "badge-neutral",
};

export default async function FunnelsPage() {
  const supabase = supabaseAdmin();

  const [{ data: funnelRows }, { data: clientRows }, { data: campaignRows }, { data: linkRows }] = await Promise.all([
    supabase.from("funnels").select("*").order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, client_id").order("name"),
    supabase.from("funnel_campaigns").select("funnel_id, campaign_id"),
  ]);

  const funnels = (funnelRows ?? []) as Funnel[];
  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));

  const campaigns: CampaignOption[] = ((campaignRows ?? []) as Pick<Campaign, "id" | "name" | "client_id">[]).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    clientName: clientNameById.get(campaign.client_id) ?? "לקוח לא ידוע",
  }));
  const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  const campaignIdsByFunnel = new Map<string, string[]>();
  for (const link of (linkRows ?? []) as FunnelCampaign[]) {
    const existing = campaignIdsByFunnel.get(link.funnel_id) ?? [];
    existing.push(link.campaign_id);
    campaignIdsByFunnel.set(link.funnel_id, existing);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">פאנלים</h1>
      <p className="mb-6 text-sm text-slate-500">מבנה השיווק מאחורי כל הצעה — אילו קמפיינים מזינים אותו, החומרים והתובנות.</p>

      <details className="card mb-4">
        <summary className="cursor-pointer text-sm font-medium">+ פאנל חדש</summary>
        <div className="mt-4">
          <FunnelForm action={createFunnelFromForm} funnel={null} clients={clients} campaigns={campaigns} selectedCampaignIds={[]} submitLabel="צור פאנל" />
        </div>
      </details>

      <div className="space-y-3">
        {funnels.map((funnel) => {
          const linkedCampaignIds = campaignIdsByFunnel.get(funnel.id) ?? [];

          return (
            <div key={funnel.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{funnel.name}</h2>
                <span className={`badge ${STATUS_BADGE_CLASS[funnel.status]}`}>{STATUS_LABEL[funnel.status]}</span>
                {funnel.stage && <span className="badge badge-neutral">{funnel.stage}</span>}
                {funnel.client_id && <span className="text-sm text-slate-500">· {clientNameById.get(funnel.client_id) ?? "לקוח לא ידוע"}</span>}
              </div>

              {funnel.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{funnel.description}</p>}

              {linkedCampaignIds.length > 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  קמפיינים: {linkedCampaignIds.map((id) => campaignNameById.get(id) ?? "קמפיין שנמחק").join(" · ")}
                </p>
              )}

              {funnel.drive_links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {funnel.drive_links.map((link, index) => (
                    <a
                      key={`${link.url}-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="badge badge-neutral hover:bg-slate-200"
                    >
                      {link.label || link.url}
                    </a>
                  ))}
                </div>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-500">ערוך</summary>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <FunnelForm
                    action={updateFunnelFromForm.bind(null, funnel.id)}
                    funnel={funnel}
                    clients={clients}
                    campaigns={campaigns}
                    selectedCampaignIds={linkedCampaignIds}
                    submitLabel="שמור שינויים"
                  />
                  <form action={deleteFunnel.bind(null, funnel.id)} className="mt-3 border-t border-slate-100 pt-3">
                    <button type="submit" className="btn btn-danger text-xs">
                      מחק פאנל
                    </button>
                  </form>
                </div>
              </details>
            </div>
          );
        })}

        {funnels.length === 0 && <p className="text-slate-500">אין פאנלים עדיין.</p>}
      </div>
    </div>
  );
}
