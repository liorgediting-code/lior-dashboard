import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { generateAiInsight, saveInsightToReport } from "@/lib/actions/ai-insights";
import { deleteReport, generateReportFromForm, saveReportTextFromForm, setReportSent } from "@/lib/actions/reports";
import { currentPeriod, formatStoredPeriod, recentPeriods } from "@/lib/reports/periods";
import type { AiInsight, ReportPeriodKind, WeeklyReport } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

type SearchParams = { kind?: string; start?: string; saved?: string };

async function generateAction(clientId: string, weekStart: string) {
  "use server";
  await generateAiInsight(clientId, weekStart);
  redirect(`/clients/${clientId}/reports`);
}

async function saveAction(clientId: string, weekStart: string, text: string) {
  "use server";
  await saveInsightToReport(clientId, weekStart, text);
  redirect(`/clients/${clientId}/reports?saved=1`);
}

export default async function ClientReportsPage({ params, searchParams }: { params: { id: string }; searchParams: SearchParams }) {
  const supabase = supabaseAdmin();

  const kind: ReportPeriodKind = searchParams.kind === "month" ? "month" : "week";
  const periods = recentPeriods(kind, 12);
  const selected = periods.find((period) => period.start === searchParams.start) ?? periods[0];
  // The AI-insight card predates periods and is keyed to the current week
  // regardless of which period is selected above.
  const insightWeek = currentPeriod("week").start;

  const [{ data: client }, { data: reports }, { data: latestInsight }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase
      .from("weekly_reports")
      .select("*")
      .eq("client_id", params.id)
      .order("week_start", { ascending: false }),
    supabase
      .from("ai_insights")
      .select("*")
      .eq("client_id", params.id)
      .eq("week_start", insightWeek)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!client) notFound();

  const insight = latestInsight as AiInsight | null;
  const reportRows = (reports ?? []) as WeeklyReport[];
  const selectedReport = reportRows.find((report) => report.week_start === selected.start && report.period_kind === kind) ?? null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="reports" />

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">דוח ללקוח</h2>
        <p className="mb-3 text-sm text-slate-500">
          מרכיב דוח מהנתונים בפועל — הוצאה, לידים, CPL ותוצאות לפי קמפיין, יחד עם מה שהלקוח כתב בשאלון. אחרי שליחה הדוח מופיע ללקוח
          בפורטל תחת &quot;דוחות&quot;.
        </p>

        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <select name="kind" defaultValue={kind} className="input w-32">
            <option value="week">שבועי</option>
            <option value="month">חודשי</option>
          </select>
          <select name="start" defaultValue={selected.start} className="input w-44">
            {periods.map((period) => (
              <option key={period.start} value={period.start}>
                {formatStoredPeriod(period.kind, period.start)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            הצג תקופה
          </button>
        </form>

        <form action={generateReportFromForm.bind(null, params.id)} className="mb-4">
          <input type="hidden" name="period_kind" value={kind} />
          <input type="hidden" name="period_start" value={selected.start} />
          <button type="submit" className="btn btn-primary">
            {selectedReport ? "רענן את הדוח מהנתונים" : "צור דוח לתקופה"}
          </button>
          {selectedReport?.sent_at && (
            <span className="mr-2 text-xs text-slate-500">הדוח כבר נשלח — בטל שליחה כדי ליצור מחדש.</span>
          )}
        </form>

        {selectedReport ? (
          <div>
            <form action={saveReportTextFromForm.bind(null, selectedReport.id, params.id)} className="space-y-2">
              {/* Editable before sending: the generated text is a starting
                  point, and the agency's own reading of the week is the part
                  the client actually values. */}
              <textarea className="input font-mono text-sm" name="report_text" rows={16} defaultValue={selectedReport.report_html ?? ""} />
              <button type="submit" className="btn btn-secondary">
                שמור נוסח
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {selectedReport.sent_at ? (
                <>
                  <span className="badge badge-winner">נשלח · {new Date(selectedReport.sent_at).toLocaleDateString("he-IL")}</span>
                  <form action={setReportSent.bind(null, selectedReport.id, params.id, false)}>
                    <button type="submit" className="btn btn-secondary text-xs">
                      בטל שליחה
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <span className="badge badge-neutral">טיוטה</span>
                  <form action={setReportSent.bind(null, selectedReport.id, params.id, true)}>
                    <button type="submit" className="btn btn-primary text-xs">
                      שלח ללקוח
                    </button>
                  </form>
                </>
              )}
              <form action={deleteReport.bind(null, selectedReport.id, params.id)}>
                <button type="submit" className="btn btn-danger text-xs">
                  מחק דוח
                </button>
              </form>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">אין עדיין דוח לתקופה הזו.</p>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">AI Insights (אופציונלי)</h2>
        <p className="mb-3 text-sm text-slate-500">
          כותב ניסוח לדוח מתוך פלט המנתח הדטרמיניסטי בלבד — לא מחליף את הלוגיקה, רק מנסח אותה.
        </p>
        <form action={generateAction.bind(null, params.id, insightWeek)} className="mb-4">
          <button type="submit" className="btn btn-secondary">
            צור ניסוח לשבוע {insightWeek}
          </button>
        </form>

        {searchParams.saved && <p className="mb-3 text-sm text-green-700">נשמר לדוח השבועי.</p>}

        {insight?.generated_text && (
          <div>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{insight.generated_text}</p>
            <form action={saveAction.bind(null, params.id, insightWeek, insight.generated_text)} className="mt-2">
              <button type="submit" className="btn btn-secondary">
                שמור בדוח השבועי
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">כל הדוחות</h2>
        <div className="space-y-2">
          {reportRows.map((report) => (
            <div key={report.id} className="border-b border-slate-100 py-2 last:border-0">
              <p className="text-sm font-medium">
                {report.period_kind === "month" ? "חודשי" : "שבועי"} · {formatStoredPeriod(report.period_kind, report.week_start)}{" "}
                {report.sent_at ? <span className="badge badge-winner">נשלח</span> : <span className="badge badge-neutral">טיוטה</span>}
              </p>
              {report.report_html && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{report.report_html}</p>}
            </div>
          ))}
          {reportRows.length === 0 && <p className="text-slate-500">אין עדיין דוחות.</p>}
        </div>
      </div>
    </div>
  );
}
