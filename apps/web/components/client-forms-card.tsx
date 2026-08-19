import Link from "next/link";
import { sendFormFromForm } from "@/lib/actions/forms";
import { INTAKE_FORM_SLUG } from "@dashboard-lior/shared";
import type { FormSubmission, FormTemplate } from "@dashboard-lior/shared";

/**
 * The agency's forms panel on a client profile: pick a form, mint the client's
 * personal link, then watch it come back filled. The intake form is listed
 * first because it's the one that opens the SOP.
 */
export function ClientFormsCard({
  clientId,
  templates,
  submissions,
  baseUrl,
}: {
  clientId: string;
  templates: FormTemplate[];
  submissions: FormSubmission[];
  baseUrl: string;
}) {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const ordered = [...templates].sort((a, b) => Number(b.slug === INTAKE_FORM_SLUG) - Number(a.slug === INTAKE_FORM_SLUG));

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">טפסים</h2>
        <Link href="/forms" className="text-xs text-slate-400 hover:text-blue-700">
          נהל טפסים ←
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-slate-500">
          אין עדיין טפסים. <Link href="/forms" className="text-blue-700 underline">צור טופס ראשון</Link>.
        </p>
      ) : (
        <form action={sendFormFromForm.bind(null, clientId)} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="label">שלח טופס</label>
            <select className="input" name="template_id" defaultValue={ordered[0]?.id}>
              {ordered.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            צור קישור
          </button>
        </form>
      )}

      {submissions.length === 0 ? (
        <p className="text-sm text-slate-500">עדיין לא נשלח טופס ללקוח הזה.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const template = templateById.get(submission.template_id);
            const submitted = submission.submitted_at != null;

            return (
              <details key={submission.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer">
                  <span className="font-medium">{template?.name ?? "טופס"}</span>
                  {submitted ? (
                    <span className="badge badge-winner mr-2">מולא</span>
                  ) : (
                    <span className="badge badge-suspect mr-2">ממתין למילוי</span>
                  )}
                  {submitted && (
                    <span className="mr-2 text-xs text-slate-400">
                      {new Date(submission.submitted_at as string).toLocaleString("he-IL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </summary>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="label">הקישור ללקוח</p>
                  <code className="mb-3 block break-all rounded-lg bg-slate-50 p-2 text-xs">
                    {`${baseUrl}/form/${submission.token}`}
                  </code>

                  {submitted && template && (
                    <dl className="space-y-2 text-sm">
                      {template.questions.map((question) => (
                        <div key={question.id}>
                          <dt className="text-slate-500">{question.label}</dt>
                          <dd className="whitespace-pre-wrap font-medium">{submission.answers[question.id] ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
