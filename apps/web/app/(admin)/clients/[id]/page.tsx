import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import { getStageDefinition } from "@/lib/sop/stage-machine";
import { advanceStageFromForm, approveGateFromForm, requestGateApprovalFromForm } from "@/lib/sop/actions";
import { ClientNotesPanel } from "@/components/client-notes-panel";
import { ClientQuestionnaireCard } from "@/components/client-questionnaire-card";
import { ClientFormsCard } from "@/components/client-forms-card";
import { formatWeekRange, resolveTemplateForClient, weekStartIso } from "@/lib/crm/questionnaire";
import type {
  Client,
  BaselineSnapshot,
  SopGate,
  ClientCurrentMetrics,
  FormSubmission,
  FormTemplate,
  DriveLink,
  Note,
  QuestionnaireResponse,
} from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { magicLink?: string; gate?: string; formLink?: string };
}) {
  const supabase = supabaseAdmin();
  const weekStart = weekStartIso();

  const [
    { data: client },
    { data: baseline },
    { data: gates },
    { data: currentMetricsRows },
    { data: noteRows },
    template,
    { data: questionnaireRow },
    { data: formTemplateRows },
    { data: formSubmissionRows },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("baseline_snapshots").select("*").eq("client_id", params.id).maybeSingle(),
    supabase.from("sop_gates").select("*").eq("client_id", params.id).order("gate_number"),
    supabase.rpc("fn_client_current_metrics", { p_client_id: params.id }),
    supabase
      .from("notes")
      .select("*")
      .eq("client_id", params.id)
      .order("note_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    resolveTemplateForClient(supabase, params.id),
    supabase.from("questionnaire_responses").select("*").eq("client_id", params.id).eq("week_start", weekStart).maybeSingle(),
    supabase.from("form_templates").select("*").order("created_at"),
    supabase.from("form_submissions").select("*").eq("client_id", params.id).order("created_at"),
  ]);

  if (!client) notFound();

  const c = client as Client;
  const baselineSnapshot = baseline as BaselineSnapshot | null;
  const gateRows = (gates ?? []) as SopGate[];
  const current = (currentMetricsRows?.[0] as ClientCurrentMetrics | undefined) ?? null;
  const notes = (noteRows ?? []) as Note[];
  const questionnaireResponse = (questionnaireRow as QuestionnaireResponse | null) ?? null;
  const formTemplates = (formTemplateRows ?? []) as FormTemplate[];
  const formSubmissions = (formSubmissionRows ?? []) as FormSubmission[];
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const stageDef = getStageDefinition(c.sop_stage);
  const isFinalStage = c.sop_stage === 8;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <p className="text-sm text-slate-500">{c.business_type}</p>
        </div>
        <Link href={`/clients/${c.id}/edit`} className="btn btn-secondary">
          ערוך פרופיל
        </Link>
      </div>

      <ClientTabs clientId={c.id} active="profile" />

      {(c.drive_links as DriveLink[]).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(c.drive_links as DriveLink[]).map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              📁 {link.label}
            </a>
          ))}
        </div>
      )}

      {searchParams.magicLink && (
        <div className="card mb-6 border-amber-300 bg-amber-50">
          <p className="mb-1 font-medium">קישור אישור ל-Gate {searchParams.gate} נוצר:</p>
          <code className="break-all text-sm">{searchParams.magicLink}</code>
        </div>
      )}

      {searchParams.formLink && (
        <div className="card mb-6 border-amber-300 bg-amber-50">
          <p className="mb-1 font-medium">קישור לטופס נוצר — שלח אותו ללקוח:</p>
          <code className="break-all text-sm">{searchParams.formLink}</code>
        </div>
      )}

      {/* The activity log is the second child of a plain flex row, which in
          an RTL document puts it on the LEFT — where the user asked for it. */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 font-semibold">שלב SOP</h2>
              <p className="mb-1 text-lg">
                שלב {c.sop_stage}: {stageDef.label}
              </p>
              <p className="mb-4 text-sm text-slate-500">{stageDef.autoAction}</p>

              {!isFinalStage && (
                <form action={advanceStageFromForm.bind(null, c.id)}>
                  <button type="submit" className="btn btn-secondary">
                    קדם לשלב הבא
                  </button>
                </form>
              )}

              <div className="mt-4 space-y-2">
                {gateRows.map((gate) => (
                  <div key={gate.gate_number} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                    <span className="text-sm">
                      Gate {gate.gate_number} — {gate.status === "approved" ? "✅ אושר" : "⏳ ממתין"}
                    </span>
                    {gate.status === "pending" && (
                      <div className="flex gap-2">
                        <form action={requestGateApprovalFromForm.bind(null, c.id, gate.gate_number)}>
                          <button type="submit" className="btn btn-secondary text-xs">
                            שלח קישור לאישור לקוח
                          </button>
                        </form>
                        <form action={approveGateFromForm.bind(null, c.id, gate.gate_number)}>
                          <button type="submit" className="btn btn-primary text-xs">
                            אשר ידנית
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                ))}
                {gateRows.length === 0 && <p className="text-sm text-slate-500">אין gates פתוחים כרגע.</p>}
              </div>
            </div>

            <div className="card">
              <h2 className="mb-3 font-semibold">לפני / עכשיו</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-slate-500">
                    <th className="pb-2 font-normal"></th>
                    <th className="pb-2 font-normal">לפני (Baseline)</th>
                    <th className="pb-2 font-normal">עכשיו (30 יום אחרונים)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 text-slate-500">לידים בחודש</td>
                    <td className="py-2">{formatNumber(baselineSnapshot?.leads_per_month)}</td>
                    <td className="py-2">{formatNumber(current?.leads_count)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">עלות ליד ממוצעת</td>
                    <td className="py-2">{formatCurrency(baselineSnapshot?.avg_cost_per_lead)}</td>
                    <td className="py-2">{formatCurrency(current?.avg_cost_per_lead)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">אחוז סגירה</td>
                    <td className="py-2">{formatPercent(baselineSnapshot?.close_rate_pct)}</td>
                    <td className="py-2">{formatPercent(current?.close_rate_pct)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium text-slate-700">עלות לעסקה</td>
                    <td className="py-2 font-medium">{formatCurrency(baselineSnapshot?.cost_per_deal)}</td>
                    <td className="py-2 font-medium">{formatCurrency(current?.cost_per_deal)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">הכנסה</td>
                    <td className="py-2">{formatCurrency(baselineSnapshot?.revenue)}</td>
                    <td className="py-2">—</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-400">
                עלות לעסקה = עלות ליד ממוצעת ÷ אחוז סגירה. max_CPL נוכחי: {formatCurrency(c.max_cpl)}
              </p>
            </div>

            <div className="xl:col-span-2">
              <ClientFormsCard
                clientId={c.id}
                templates={formTemplates}
                submissions={formSubmissions}
                baseUrl={baseUrl}
              />
            </div>

            <div className="xl:col-span-2">
              <ClientQuestionnaireCard
                clientId={c.id}
                weekLabel={formatWeekRange(weekStart)}
                questions={template?.questions ?? []}
                response={questionnaireResponse}
              />
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          <ClientNotesPanel clientId={c.id} notes={notes} />
        </aside>
      </div>
    </div>
  );
}
