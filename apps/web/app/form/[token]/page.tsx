import { supabaseAdmin } from "@/lib/supabase/admin";
import { FormFillForm } from "@/components/form-fill-form";
import type { FormSubmission, FormTemplate } from "@dashboard-lior/shared";

// Public on purpose: a client at SOP stage 0 has no portal login yet, so this
// page lives OUTSIDE both (admin) and client/[clientId] (which requires a
// session). The token in the URL is the credential — same shape as the
// gate-approval page at app/approve/[token].
export const dynamic = "force-dynamic";

export default async function PublicFormPage({ params }: { params: { token: string } }) {
  const supabase = supabaseAdmin();
  const { data: row } = await supabase
    .from("form_submissions")
    .select("*, form_templates(name, questions), clients(name)")
    .eq("token", params.token)
    .maybeSingle();

  if (!row) {
    return <p className="mx-auto max-w-md pt-20 text-center text-slate-600">קישור לא נמצא.</p>;
  }

  // The embedded rows are modelled rather than cast away, so a renamed column
  // still fails typecheck.
  const submission = row as FormSubmission & {
    form_templates: Pick<FormTemplate, "name" | "questions"> | null;
    clients: { name: string } | null;
  };
  const template = submission.form_templates;
  const clientName = submission.clients?.name ?? "";
  const submitted = submission.submitted_at != null;

  if (!template) {
    return <p className="mx-auto max-w-md pt-20 text-center text-slate-600">הטופס לא נמצא.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">
        {template.name}
        {clientName && ` — ${clientName}`}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        אין תשובות נכונות או לא נכונות — ככל שתפרט יותר, כך נוכל לדייק עבורך.
      </p>

      {submitted ? (
        <>
          <div className="card mb-4">
            <p className="font-medium">תודה! קיבלנו את הטופס. ✅</p>
            <p className="mt-1 text-sm text-slate-500">נעבור על התשובות ונחזור אליך.</p>

            <dl className="mt-4 space-y-2 text-sm">
              {template.questions.map((question) => (
                <div key={question.id}>
                  <dt className="text-slate-500">{question.label}</dt>
                  <dd className="whitespace-pre-wrap font-medium">{submission.answers[question.id] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Same affordance as the weekly questionnaire: filled means done,
              but a client who mistyped something can still fix it. */}
          <details className="card">
            <summary className="cursor-pointer text-sm text-slate-500">רוצה לתקן משהו?</summary>
            <div className="mt-3">
              <FormFillForm token={params.token} questions={template.questions} answers={submission.answers} submitted />
            </div>
          </details>
        </>
      ) : (
        <FormFillForm token={params.token} questions={template.questions} answers={submission.answers} submitted={false} />
      )}
    </div>
  );
}
