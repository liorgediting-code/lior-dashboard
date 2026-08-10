import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CampaignStatsTable, type StatsRow } from "@/components/campaign-stats-table";
import { fetchCampaignStats, fetchCampaignsForClient } from "@/lib/metrics/fetch-stats";
import { trailingDays } from "@/lib/metrics/campaign-stats";
import type { Campaign, DriveLink, Funnel, FunnelCampaign, Note } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

const STATUS_LABELS: Record<Funnel["status"], string> = {
  active: "פעיל",
  paused: "מושהה",
  archived: "בארכיון",
};

export default async function ClientFunnelsPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const range = trailingDays(WINDOW_DAYS);

  const [{ data: client }, { data: funnelRows }, campaigns] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("funnels").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    fetchCampaignsForClient(supabase, params.id),
  ]);
  if (!client) notFound();

  const funnels = (funnelRows ?? []) as Funnel[];
  const funnelIds = funnels.map((funnel) => funnel.id);

  // Attachments and notes are fetched for every funnel at once rather than
  // per funnel in the render loop — otherwise a client with ten funnels
  // fires twenty round-trips per page view.
  const [{ data: linkRows }, { data: noteRows }] = await Promise.all([
    funnelIds.length
      ? supabase.from("funnel_campaigns").select("*").in("funnel_id", funnelIds)
      : Promise.resolve({ data: [] as FunnelCampaign[] }),
    funnelIds.length
      ? supabase.from("notes").select("*").in("funnel_id", funnelIds).order("note_date", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Note[] }),
  ]);

  const links = (linkRows ?? []) as FunnelCampaign[];
  const notes = (noteRows ?? []) as Note[];

  // Stats are computed over the client's whole campaign set in one walk, then
  // read per funnel — a campaign can sit in more than one funnel.
  const stats = await fetchCampaignStats(
    supabase,
    campaigns.map((campaign) => campaign.id),
    range
  );

  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const campaignIdsByFunnel = new Map<string, string[]>();
  for (const link of links) {
    const list = campaignIdsByFunnel.get(link.funnel_id) ?? [];
    list.push(link.campaign_id);
    campaignIdsByFunnel.set(link.funnel_id, list);
  }

  function statsRowsFor(funnelId: string): StatsRow[] {
    return (campaignIdsByFunnel.get(funnelId) ?? [])
      .map((campaignId) => campaignById.get(campaignId))
      .filter((campaign): campaign is Campaign => campaign != null)
      .map((campaign) => ({
        key: campaign.id,
        label: campaign.name,
        sublabel: [campaign.funnel_stage, campaign.status].filter(Boolean).join(" · ") || undefined,
        stats: stats.byCampaign(campaign.id),
      }));
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="funnels" />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{WINDOW_DAYS} הימים האחרונים</p>
        <Link href="/funnels" className="btn btn-secondary">
          נהל פאנלים
        </Link>
      </div>

      <div className="space-y-6">
        {funnels.map((funnel) => {
          const rows = statsRowsFor(funnel.id);
          const funnelNotes = notes.filter((note) => note.funnel_id === funnel.id);

          return (
            <div key={funnel.id} className="card">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{funnel.name}</h2>
                {funnel.stage && <span className="badge badge-insufficient">{funnel.stage}</span>}
                <span className={`badge ${funnel.status === "active" ? "badge-winner" : "badge-neutral"}`}>
                  {STATUS_LABELS[funnel.status]}
                </span>
              </div>

              {funnel.description && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{funnel.description}</p>}

              {(funnel.drive_links as DriveLink[]).length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {(funnel.drive_links as DriveLink[]).map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs">
                      📁 {link.label}
                    </a>
                  ))}
                </div>
              )}

              <h3 className="mb-2 text-sm font-semibold text-slate-700">קמפיינים</h3>
              <CampaignStatsTable rows={rows} totalLabel="סה״כ בפאנל" />

              {funnelNotes.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-400">הערות על הפאנל ({funnelNotes.length})</summary>
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    {funnelNotes.map((note) => (
                      <div key={note.id} className="text-sm">
                        <span className="text-xs text-slate-400">{note.note_date}</span>
                        <p className="whitespace-pre-wrap">{note.body}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {funnels.length === 0 && (
          <div className="card">
            <p className="text-slate-500">
              אין עדיין פאנלים משויכים ללקוח הזה.{" "}
              <Link href="/funnels" className="underline">
                צור פאנל
              </Link>{" "}
              ובחר את הלקוח הזה בטופס.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
