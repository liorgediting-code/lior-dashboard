import { supabaseAdmin } from "@/lib/supabase/admin";
import { QuestionnaireEditor } from "@/components/questionnaire-editor";
import { createTemplateFromForm, saveTemplateFromForm, duplicateTemplate, deleteTemplate } from "@/lib/actions/forms";
import { INTAKE_FORM_SLUG } from "@dashboard-lior/shared";
import type { FormSubmission, FormTemplate } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const supabase = supabaseAdmin();

  const [{ data: templateRows }, { data: submissionRows }] = await Promise.all([
    supabase.from("form_templates").select("*").order("created_at"),
    supabase.from("form_submissions").select("*"),
  ]);

  const templates = (templateRows ?? []) as FormTemplate[];
  const submissions = (submissionRows ?? []) as FormSubmission[];

  const statsByTemplate = new Map<string, { sent: number; filled: number }>();
  for (const submission of submissions) {
    const stats = statsByTemplate.get(submission.template_id) ?? { sent: 0, filled: 0 };
    stats.sent += 1;
    if (submission.submitted_at) stats.filled += 1;
    statsByTemplate.set(submission.template_id, stats);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">טפסים</h1>
      <p className="mb-6 text-sm text-slate-500">
        טפסים שאתה בונה ושולח ללקוחות בקישור אישי. טופס האפיון המובנה הוא זה שנשלח בתחילת המסלול — מילוי שלו מקדם את
        הלקוח אוטומטית משלב 0 לשלב 1. שליחת הטופס עצמה נעשית מעמוד הלקוח.
      </p>

      <details className="card mb-6">
        <summary className="cursor-pointer font-semibold">+ טופס חדש</summary>
        <form action={createTemplateFromForm} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label className="label">שם הטופס</label>
            <input className="input" name="name" placeholder="למשל: שאלון לפני צילום" />
          </div>
          <div>
            <label className="label">שאלות</label>
            <QuestionnaireEditor name="questions" defaultValue={[]} />
          </div>
          <button type="submit" className="btn btn-primary">
            צור טופס
          </button>
        </form>
      </details>

      <div className="space-y-3">
        {templates.map((template) => {
          const isIntake = template.slug === INTAKE_FORM_SLUG;
          const stats = statsByTemplate.get(template.id) ?? { sent: 0, filled: 0 };

          return (
            <div key={template.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{template.name}</h2>
                {isIntake && <span className="badge badge-winner">טופס אפיון מובנה</span>}
                <span className="text-sm text-slate-400">
                  {template.questions.length} שאלות · נשלח ל-{stats.sent} לקוחות · מולא {stats.filled}
                </span>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-500">ערוך שאלות</summary>
                <form action={saveTemplateFromForm.bind(null, template.id)} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    <label className="label">שם הטופס</label>
                    <input className="input" name="name" defaultValue={template.name} />
                  </div>
                  <div>
                    <label className="label">שאלות</label>
                    <QuestionnaireEditor name="questions" defaultValue={template.questions} />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    שמור שינויים
                  </button>
                </form>
              </details>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <form action={duplicateTemplate.bind(null, template.id)}>
                  <button type="submit" className="btn btn-secondary text-xs">
                    שכפל
                  </button>
                </form>
                {/* The built-in intake form, and any form already sent, stay
                    undeletable — the action enforces this too. */}
                {!isIntake && stats.sent === 0 && (
                  <form action={deleteTemplate.bind(null, template.id)}>
                    <button type="submit" className="btn btn-secondary text-xs text-red-600">
                      מחק
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}

        {templates.length === 0 && <p className="text-slate-500">אין עדיין טפסים.</p>}
      </div>
    </div>
  );
}
