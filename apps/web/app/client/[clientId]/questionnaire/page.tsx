import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { QuestionnaireFillForm } from "@/components/questionnaire-fill-form";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { formatWeekRange, resolveTemplateForClient, weekStartIso } from "@/lib/crm/questionnaire";
import type { QuestionnaireResponse } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalQuestionnairePage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const weekStart = weekStartIso();

  const [{ data: client }, template, tabsData, { data: responseRow }, { data: pastRows }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    resolveTemplateForClient(supabase, params.clientId),
    getPortalTabsData(supabase, params.clientId),
    supabase.from("questionnaire_responses").select("*").eq("client_id", params.clientId).eq("week_start", weekStart).maybeSingle(),
    supabase
      .from("questionnaire_responses")
      .select("*")
      .eq("client_id", params.clientId)
      .neq("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(8),
  ]);
  if (!client) notFound();

  const existingResponse = (responseRow as QuestionnaireResponse | null) ?? null;
  const pastResponses = (pastRows ?? []) as QuestionnaireResponse[];

  return (
    <div>
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <PortalTabs
        clientId={params.clientId}
        active="questionnaire"
        notificationsCount={tabsData.notificationsCount}
        showAutomations={tabsData.showAutomations}
      />

      <h1 className="mb-1 text-xl font-bold">{template?.name ?? "שאלון שבועי"}</h1>
      <p className="mb-4 text-sm text-slate-500">
        השבוע: {formatWeekRange(weekStart)}
        {existingResponse && " · כבר מילאת השבוע — אפשר לעדכן את התשובות"}
      </p>

      {template && template.questions.length > 0 ? (
        <QuestionnaireFillForm clientId={params.clientId} questions={template.questions} existingResponse={existingResponse} />
      ) : (
        <p className="text-slate-500">עדיין לא הוגדר שאלון. נעדכן אותך כשיהיה.</p>
      )}

      {pastResponses.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">שבועות קודמים</h2>
          <div className="space-y-2">
            {pastResponses.map((response) => (
              <details key={response.id} className="card">
                <summary className="cursor-pointer text-sm font-medium">{formatWeekRange(response.week_start)}</summary>
                <dl className="mt-2 space-y-1 text-sm">
                  {(template?.questions ?? []).map((question) => (
                    <div key={question.id} className="flex gap-2">
                      <dt className="text-slate-500">{question.label}</dt>
                      <dd className="font-medium">{response.answers[question.id] ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
