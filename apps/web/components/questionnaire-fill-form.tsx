"use client";

import { useState } from "react";
import { submitQuestionnaireFromForm } from "@/lib/actions/questionnaires";
import type { QuestionnaireQuestion, QuestionnaireResponse } from "@dashboard-lior/shared";

function answerToInputValue(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

function QuestionField({ question, existing }: { question: QuestionnaireQuestion; existing: string | number | null | undefined }) {
  const fieldName = `q_${question.id}`;
  const defaultValue = answerToInputValue(existing);

  return (
    <div>
      <label className="label">
        {question.label}
        {question.required && <span className="text-red-600"> *</span>}
      </label>

      {question.type === "textarea" ? (
        <textarea className="input" name={fieldName} rows={3} defaultValue={defaultValue} required={question.required} />
      ) : question.type === "rating" ? (
        <select className="input" name={fieldName} defaultValue={defaultValue} required={question.required}>
          <option value="">בחר דירוג</option>
          {[1, 2, 3, 4, 5].map((score) => (
            <option key={score} value={score}>
              {score}
            </option>
          ))}
        </select>
      ) : (
        <input
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
}

export function QuestionnaireFillForm({
  clientId,
  questions,
  existingResponse,
}: {
  clientId: string;
  questions: QuestionnaireQuestion[];
  existingResponse: QuestionnaireResponse | null;
}) {
  const [missingLabel, setMissingLabel] = useState<string | null>(null);

  /**
   * Some in-app browsers (WhatsApp/Instagram/Facebook's built-in WebView) don't
   * reliably enforce the native `required` attribute, especially on <select>,
   * so a client could tap through an empty form there and have it silently
   * save as "complete". This checks required fields with plain JS instead —
   * that works regardless of the WebView's constraint-validation support —
   * and blocks the submit (the server action also re-checks as a backstop).
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    for (const question of questions) {
      if (!question.required) continue;
      const raw = String(formData.get(`q_${question.id}`) ?? "").trim();
      if (raw === "") {
        event.preventDefault();
        setMissingLabel(question.label);
        return;
      }
    }
    setMissingLabel(null);
  }

  return (
    <form action={submitQuestionnaireFromForm.bind(null, clientId)} onSubmit={handleSubmit} className="card space-y-4">
      {missingLabel && <p className="text-sm text-red-600">נא למלא את השדה: {missingLabel}</p>}

      {questions.map((question) => (
        <QuestionField key={question.id} question={question} existing={existingResponse?.answers[question.id]} />
      ))}

      <button type="submit" className="btn btn-primary">
        {existingResponse ? "עדכן תשובות" : "שלח שאלון"}
      </button>
    </form>
  );
}
