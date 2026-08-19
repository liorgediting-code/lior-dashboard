import { submitFormFromForm } from "@/lib/actions/forms";
import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

function answerToInputValue(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * Renders whatever questions the template currently holds — never a hardcoded
 * list, so edits made on /forms show up here immediately.
 */
export function FormFillForm({
  token,
  questions,
  answers,
  submitted,
}: {
  token: string;
  questions: QuestionnaireQuestion[];
  answers: Record<string, string | number | null>;
  submitted: boolean;
}) {
  return (
    <form action={submitFormFromForm.bind(null, token)} className="card space-y-4">
      {questions.map((question) => {
        const fieldName = `q_${question.id}`;
        const defaultValue = answerToInputValue(answers[question.id]);

        return (
          <div key={question.id}>
            <label className="label" htmlFor={fieldName}>
              {question.label}
              {question.required && <span className="text-red-600"> *</span>}
            </label>

            {question.type === "textarea" ? (
              <textarea
                id={fieldName}
                className="input"
                name={fieldName}
                rows={3}
                defaultValue={defaultValue}
                required={question.required}
              />
            ) : question.type === "rating" ? (
              <select id={fieldName} className="input" name={fieldName} defaultValue={defaultValue} required={question.required}>
                <option value="">בחר דירוג</option>
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={fieldName}
                className="input"
                name={fieldName}
                type={question.type === "number" ? "number" : "text"}
                step={question.type === "number" ? "any" : undefined}
                defaultValue={defaultValue}
                required={question.required}
              />
            )}
          </div>
        );
      })}

      <button type="submit" className="btn btn-primary">
        {submitted ? "עדכן תשובות" : "שלח טופס"}
      </button>
    </form>
  );
}
