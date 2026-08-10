import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { formatStoredPeriod } from "@/lib/reports/periods";
import type { WeeklyReport } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalReportsPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, tabsData, { data: reportRows }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    getPortalTabsData(supabase, params.clientId),
    // `sent_at is not null` is the publication switch — drafts the agency is
    // still writing must never reach this page.
    supabase
      .from("weekly_reports")
      .select("*")
      .eq("client_id", params.clientId)
      .not("sent_at", "is", null)
      .order("week_start", { ascending: false }),
  ]);
  if (!client) notFound();

  const reports = (reportRows ?? []) as WeeklyReport[];

  return (
    <div>
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <PortalTabs clientId={params.clientId} active="reports" {...tabsData} />

      <h1 className="mb-1 text-xl font-bold">דוחות</h1>
      <p className="mb-4 text-sm text-slate-500">סיכום התוצאות של הקמפיינים — מה הושקע, מה חזר ומה קורה עכשיו.</p>

      <div className="space-y-3">
        {reports.map((report, index) => (
          // The newest report is open by default; older ones stay collapsed
          // so the page opens on "what happened this week".
          <details key={report.id} className="card" open={index === 0}>
            <summary className="cursor-pointer font-medium">
              {report.period_kind === "month" ? "דוח חודשי" : "דוח שבועי"} · {formatStoredPeriod(report.period_kind, report.week_start)}
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm">{report.report_html}</p>
          </details>
        ))}

        {reports.length === 0 && <p className="text-slate-500">עדיין אין דוחות. נעדכן אותך ברגע שיהיה.</p>}
      </div>
    </div>
  );
}
