import { describe, expect, it } from "vitest";
import { buildSubmissionMarkdown, submissionExportFilename } from "../export-markdown";
import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

const questions: QuestionnaireQuestion[] = [
  { id: "name", label: "שם", type: "text", required: true },
  { id: "story", label: "מה העסק עושה?", type: "textarea", required: true },
  { id: "budget", label: "תקציב חודשי", type: "number", required: true },
  { id: "score", label: "דירוג", type: "rating", required: false },
];

const base = {
  clientName: "ליאב כהן",
  templateName: "טופס אפיון",
  submittedAt: "2026-08-31T09:15:00.000Z",
  questions,
};

describe("buildSubmissionMarkdown", () => {
  it("opens with the template and client name as the title", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: {} });
    expect(md.split("\n")[0]).toBe("# טופס אפיון — ליאב כהן");
  });

  it("renders every question as a heading with its answer beneath", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { story: "אני עוזר למוסכים לגייס לקוחות" } });
    expect(md).toContain("## מה העסק עושה?\n\nאני עוזר למוסכים לגייס לקוחות");
  });

  it("marks unanswered questions rather than dropping them", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { name: "ליאב" } });
    expect(md).toContain("## דירוג\n\n_(לא נענה)_");
  });

  it("treats an empty string and a whitespace-only answer as unanswered", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { story: "", budget: "   " } });
    expect(md).toContain("## מה העסק עושה?\n\n_(לא נענה)_");
    expect(md).toContain("## תקציב חודשי\n\n_(לא נענה)_");
  });

  it("renders the number 0 as an answer, not as unanswered", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { budget: 0 } });
    expect(md).toContain("## תקציב חודשי\n\n0");
  });

  // Driven by the TEMPLATE, so an answer left over from a question the agency
  // has since deleted never leaks into the document handed to the strategist.
  it("ignores answers with no matching question", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { removed_question: "טקסט ישן" } });
    expect(md).not.toContain("טקסט ישן");
  });

  it("keeps multi-line answers intact", () => {
    const md = buildSubmissionMarkdown({ ...base, answers: { story: "שורה ראשונה\nשורה שנייה" } });
    expect(md).toContain("שורה ראשונה\nשורה שנייה");
  });

  it("notes when the form has not been submitted yet", () => {
    const md = buildSubmissionMarkdown({ ...base, submittedAt: null, answers: {} });
    expect(md).toContain("טרם מולא");
  });

  it("has no unreplaced placeholders even when everything is empty", () => {
    const md = buildSubmissionMarkdown({ ...base, questions: [], answers: {} });
    expect(md).not.toContain("undefined");
    expect(md).not.toContain("null");
  });
});

describe("submissionExportFilename", () => {
  it("joins the template and client names with the submission date", () => {
    expect(submissionExportFilename("טופס אפיון", "ליאב כהן", "2026-08-31T09:15:00.000Z")).toBe(
      "טופס-אפיון-ליאב-כהן-2026-08-31.md"
    );
  });

  // Slashes and colons would break Content-Disposition parsing and are
  // illegal in filenames on at least one major platform.
  it("strips characters that are illegal in filenames", () => {
    expect(submissionExportFilename('a/b:c*d?e"f<g>h|i', "x", "2026-08-31T00:00:00.000Z")).toBe("abcdefghi-x-2026-08-31.md");
  });

  it("falls back to today's date when the form was never submitted", () => {
    expect(submissionExportFilename("טופס", "לקוח", null)).toMatch(/^טופס-לקוח-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
