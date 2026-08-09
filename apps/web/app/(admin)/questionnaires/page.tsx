import { supabaseAdmin } from "@/lib/supabase/admin";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { saveTemplateFromForm, deleteClientTemplate } from "@/lib/actions/questionnaires";
import { formatWeekRange, weekStartIso } from "@/lib/crm/questionnaire";
import type { Client, QuestionnaireQuestion, QuestionnaireResponse, QuestionnaireTemplate } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

function TemplateForm({
  clientId,
  template,
  submitLabel,
}: {
  clientId: string | null;
  template: QuestionnaireTemplate | null;
  submitLabel: string;
}) {
  return (
    <form action={saveTemplateFromForm.bind(null, clientId)} className="space-y-3">
      <div>
        <label className="label">שם השאלון</label>
        <input className="input" name="name" defaultValue={template?.name ?? "שאלון שבועי"} />
      </div>
      <div>
        <label className="label">שאלות</label>
        <QuestionnaireEditor name="questions" defaultValue={template?.questions ?? []} />
      </div>
      <button type="submit" className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}

function ResponseCard({ response, questions }: { response: QuestionnaireResponse; questions: QuestionnaireQuestion[] }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-medium">
        {formatWeekRange(response.week_start)}
        <span className="mr-2 text-xs font-normal text-slate-400">
          נשלח {new Date(response.submitted_at).toLocaleDateString("he-IL")}
        </span>
      </summary>
      <dl className="mt-2 space-y-1 text-sm">
        {questions.map((question) => (
          <div key={question.id} className="flex flex-wrap gap-2">
            <dt className="text-slate-500">{question.label}</dt>
            <dd className="font-medium">{response.answers[question.id] ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default async function QuestionnairesPage() {
  const supabase = supabaseAdmin();

  const [{ data: templateRows }, { data: clientRows }, { data: responseRows }] = await Promise.all([
    supabase.from("questionnaire_templates").select("*"),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("questionnaire_responses").select("*").order("week_start", { ascending: false }),
  ]);

  const templates = (templateRows ?? []) as QuestionnaireTemplate[];
  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  const responses = (responseRows ?? []) as QuestionnaireResponse[];

  const globalTemplate = templates.find((t) => t.client_id === null) ?? null;
  const overrideByClient = new Map(templates.filter((t) => t.client_id !== null).map((t) => [t.client_id as string, t]));

  const responsesByClient = new Map<string, QuestionnaireResponse[]>();
  for (const response of responses) {
    const existing = responsesByClient.get(response.client_id) ?? [];
    existing.push(response);
    responsesByClient.set(response.client_id, existing);
  }

  const thisWeek = weekStartIso();
  const submittedThisWeek = new Set(responses.filter((r) => r.week_start === thisWeek).map((r) => r.client_id));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">שאלונים</h1>
      <p className="mb-6 text-sm text-slate-500">
        שאלון שבועי שהלקוחות ממלאים בפורטל שלהם. תבנית גלובלית אחת לכולם, עם אפשרות לתבנית ייעודית לכל לקוח.
      </p>

      <div className="card mb-4">
        <h2 className="mb-1 text-lg font-semibold">תבנית גלובלית</h2>
        <p className="mb-3 text-sm text-slate-500">כל לקוח שאין לו תבנית ייעודית רואה את זו.</p>
        <TemplateForm clientId={null} template={globalTemplate} submitLabel="שמור תבנית גלובלית" />
      </div>

      <h2 className="mb-2 text-lg font-semibold">לפי לקוח</h2>
      <div className="space-y-3">
        {clients.map((client) => {
          const override = overrideByClient.get(client.id) ?? null;
          const effectiveQuestions = (override ?? globalTemplate)?.questions ?? [];
          const clientResponses = responsesByClient.get(client.id) ?? [];

          return (
            <div key={client.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{client.name}</h3>
                {override ? <span className="badge badge-insufficient">תבנית ייעודית</span> : <span className="badge badge-neutral">תבנית גלובלית</span>}
                {submittedThisWeek.has(client.id) ? (
                  <span className="badge badge-winner">מילא השבוע</span>
                ) : (
                  <span className="badge badge-kill">לא מילא השבוע</span>
                )}
                <span className="text-sm text-slate-400">{clientResponses.length} תשובות סה״כ</span>
              </div>

              {clientResponses.length > 0 && (
                <div className="mt-3 space-y-2">
                  {clientResponses.map((response) => (
                    <ResponseCard key={response.id} response={response} questions={effectiveQuestions} />
                  ))}
                </div>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-500">תבנית ייעודית ללקוח הזה</summary>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <TemplateForm
                    clientId={client.id}
                    template={override ?? globalTemplate}
                    submitLabel={override ? "שמור תבנית ייעודית" : "צור תבנית ייעודית"}
                  />
                  {override && (
                    <form action={deleteClientTemplate.bind(null, client.id)} className="mt-3 border-t border-slate-100 pt-3">
                      <button type="submit" className="btn btn-secondary text-xs">
                        מחק תבנית ייעודית (חזרה לגלובלית)
                      </button>
                    </form>
                  )}
                </div>
              </details>
            </div>
          );
        })}

        {clients.length === 0 && <p className="text-slate-500">אין לקוחות עדיין.</p>}
      </div>
    </div>
  );
}
