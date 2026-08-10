import Link from "next/link";
import type { QuestionnaireQuestion, QuestionnaireResponse } from "@dashboard-lior/shared";

/**
 * This week's questionnaire answers, on the client's profile.
 *
 * Scoped to the CURRENT week only, deliberately: the client's portal shows
 * one questionnaire per week, so this is the answer to "what did they tell me
 * about right now". Once the week rolls over this empties and the previous
 * week's answers move to the archive under /questionnaires.
 */
export function ClientQuestionnaireCard({
  clientId,
  weekLabel,
  questions,
  response,
}: {
  clientId: string;
  weekLabel: string;
  questions: QuestionnaireQuestion[];
  response: QuestionnaireResponse | null;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">שאלון השבוע · {weekLabel}</h2>
        {response ? (
          <span className="badge badge-winner">מולא</span>
        ) : (
          <span className="badge badge-insufficient">ממתין למילוי</span>
        )}
      </div>

      {response ? (
        <dl className="space-y-2 text-sm">
          {questions.map((question) => {
            const answer = response.answers[question.id];
            return (
              <div key={question.id}>
                <dt className="text-slate-500">{question.label}</dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {answer === null || answer === undefined || answer === "" ? "—" : String(answer)}
                </dd>
              </div>
            );
          })}
          {questions.length === 0 && <p className="text-slate-500">התבנית ריקה — אין שאלות להציג.</p>}
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          הלקוח עדיין לא מילא את השאלון השבוע.{" "}
          <Link href={`/client/${clientId}/questionnaire`} className="underline">
            קישור לשאלון
          </Link>
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        <Link href="/questionnaires" className="underline">
          כל התשובות וניהול התבניות
        </Link>
      </p>
    </div>
  );
}
