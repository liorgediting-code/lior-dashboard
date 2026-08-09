import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { VerdictBadge } from "@/components/verdict-badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { runAnalyzer } from "@/lib/analyzer/run-analyzer";
import { syncKillQueue } from "@/lib/analyzer/sync-kill-queue";

export const dynamic = "force-dynamic";

async function syncKillQueueAction(clientId: string) {
  "use server";
  await syncKillQueue(clientId);
  redirect(`/clients/${clientId}/analyzer?synced=1`);
}

export default async function ClientAnalyzerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { synced?: string };
}) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", params.id).single();
  if (!client) notFound();

  let report;
  let errorMessage: string | null = null;
  try {
    report = await runAnalyzer(params.id);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "שגיאה בהרצת המנתח";
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="analyzer" />

      {errorMessage && <div className="card mb-6 border-red-300 bg-red-50 text-red-700">{errorMessage}</div>}

      {report && (
        <>
          {searchParams.synced && <div className="card mb-4 border-green-300 bg-green-50">מודעות ה-KILL עודכנו בתור ההריגה.</div>}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {report.since} — {report.until} · max_CPL: <strong>{formatCurrency(report.maxCpl)}</strong> (מסלול{" "}
              {report.maxCplRoute})
            </p>
            <form action={syncKillQueueAction.bind(null, params.id)}>
              <button type="submit" className="btn btn-danger">
                עדכן תור הריגה
              </button>
            </form>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500">
                  <th className="pb-2 font-normal">מודעה</th>
                  <th className="pb-2 font-normal">סט מודעות</th>
                  <th className="pb-2 font-normal">Spend</th>
                  <th className="pb-2 font-normal">Leads</th>
                  <th className="pb-2 font-normal">CPL</th>
                  <th className="pb-2 font-normal">סטטוס</th>
                  <th className="pb-2 font-normal">פעולה מומלצת</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((row) => (
                  <tr key={row.adId}>
                    <td className="py-2">{row.adName}</td>
                    <td className="py-2 text-slate-500">{row.adsetName}</td>
                    <td className="py-2">{formatCurrency(row.spend)}</td>
                    <td className="py-2">{formatNumber(row.leads)}</td>
                    <td className="py-2">{formatCurrency(row.cpl)}</td>
                    <td className="py-2">
                      <VerdictBadge verdict={row.verdict} />
                    </td>
                    <td className="py-2 text-slate-500">{row.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length === 0 && <p className="p-4 text-slate-500">אין נתוני מודעות עדיין.</p>}
          </div>
        </>
      )}
    </div>
  );
}
