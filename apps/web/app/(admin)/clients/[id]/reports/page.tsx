import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { generateAiInsight, saveInsightToReport } from "@/lib/actions/ai-insights";
import type { Client, WeeklyReport, AiInsight } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().slice(0, 10);
}

async function generateAction(clientId: string, weekStart: string) {
  "use server";
  await generateAiInsight(clientId, weekStart);
  redirect(`/clients/${clientId}/reports?week=${weekStart}`);
}

async function saveAction(clientId: string, weekStart: string, text: string) {
  "use server";
  await saveInsightToReport(clientId, weekStart, text);
  redirect(`/clients/${clientId}/reports?week=${weekStart}&saved=1`);
}

export default async function ClientReportsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string; saved?: string };
}) {
  const supabase = supabaseAdmin();
  const weekStart = searchParams.week ?? currentWeekStart();

  const [{ data: client }, { data: reports }, { data: latestInsight }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("weekly_reports").select("*").eq("client_id", params.id).order("week_start", { ascending: false }),
    supabase
      .from("ai_insights")
      .select("*")
      .eq("client_id", params.id)
      .eq("week_start", weekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!client) notFound();

  const insight = latestInsight as AiInsight | null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="reports" />

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">AI Insights (אופציונלי)</h2>
        <p className="mb-3 text-sm text-slate-500">
          כותב ניסוח לדוח מתוך פלט המנתח הדטרמיניסטי בלבד — לא מחליף את הלוגיקה, רק מנסח אותה.
        </p>
        <form action={generateAction.bind(null, params.id, weekStart)} className="mb-4">
          <button type="submit" className="btn btn-primary">
            צור ניסוח לשבוע {weekStart}
          </button>
        </form>

        {searchParams.saved && <p className="mb-3 text-sm text-green-700">נשמר לדוח השבועי.</p>}

        {insight?.generated_text && (
          <div>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{insight.generated_text}</p>
            <form action={saveAction.bind(null, params.id, weekStart, insight.generated_text)} className="mt-2">
              <button type="submit" className="btn btn-secondary">
                שמור בדוח השבועי
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">דוחות שבועיים</h2>
        <div className="space-y-2">
          {((reports ?? []) as WeeklyReport[]).map((report) => (
            <div key={report.id} className="border-b border-slate-100 py-2 last:border-0">
              <p className="text-sm font-medium">{report.week_start}</p>
              {report.report_html && <p className="whitespace-pre-wrap text-sm text-slate-600">{report.report_html}</p>}
            </div>
          ))}
          {(reports ?? []).length === 0 && <p className="text-slate-500">אין עדיין דוחות שבועיים.</p>}
        </div>
      </div>
    </div>
  );
}
