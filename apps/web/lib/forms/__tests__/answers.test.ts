import { describe, expect, it } from "vitest";
import { parseFormAnswers } from "../answers";
import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

const questions: QuestionnaireQuestion[] = [
  { id: "name", label: "שם", type: "text", required: true },
  { id: "story", label: "ספר", type: "textarea", required: false },
  { id: "budget", label: "תקציב", type: "number", required: true },
  { id: "score", label: "דירוג", type: "rating", required: false },
];

function from(values: Record<string, string>) {
  return (field: string) => values[field] ?? null;
}

describe("parseFormAnswers", () => {
  it("keeps text answers as strings", () => {
    expect(parseFormAnswers(questions, from({ q_name: "דני" })).name).toBe("דני");
  });

  it("coerces number and rating answers", () => {
    const answers = parseFormAnswers(questions, from({ q_budget: "5000", q_score: "4" }));
    expect(answers.budget).toBe(5000);
    expect(answers.score).toBe(4);
  });

  it("stores null rather than NaN for a non-numeric number answer", () => {
    expect(parseFormAnswers(questions, from({ q_budget: "הרבה" })).budget).toBeNull();
  });

  it("trims, and treats whitespace-only as unanswered", () => {
    const answers = parseFormAnswers(questions, from({ q_name: "  דני  ", q_story: "   " }));
    expect(answers.name).toBe("דני");
    expect(answers.story).toBeNull();
  });

  it("includes every question, answered or not", () => {
    expect(Object.keys(parseFormAnswers(questions, from({})))).toEqual(["name", "story", "budget", "score"]);
  });

  it("ignores fields the template never asked for", () => {
    const answers = parseFormAnswers(questions, from({ q_name: "דני", q_injected: "x" }));
    expect(answers).not.toHaveProperty("injected");
  });
});
