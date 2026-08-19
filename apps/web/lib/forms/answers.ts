import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

/**
 * Turns a submitted form's fields into the `answers` jsonb, typed per question.
 *
 * Driven by the TEMPLATE's questions rather than by whatever the request
 * happens to contain: a client can rename a field in devtools, but only keys
 * the agency actually asked for are ever stored.
 */
export function parseFormAnswers(
  questions: QuestionnaireQuestion[],
  get: (field: string) => string | null
): Record<string, string | number | null> {
  const answers: Record<string, string | number | null> = {};

  for (const question of questions) {
    const raw = (get(`q_${question.id}`) ?? "").trim();
    if (raw === "") {
      answers[question.id] = null;
      continue;
    }
    if (question.type === "number" || question.type === "rating") {
      const parsed = Number(raw);
      answers[question.id] = Number.isFinite(parsed) ? parsed : null;
    } else {
      answers[question.id] = raw;
    }
  }

  return answers;
}

/** FormData adapter for parseFormAnswers. */
export function parseFormAnswersFromFormData(
  questions: QuestionnaireQuestion[],
  formData: FormData
): Record<string, string | number | null> {
  return parseFormAnswers(questions, (field) => {
    const value = formData.get(field);
    return value == null ? null : String(value);
  });
}
