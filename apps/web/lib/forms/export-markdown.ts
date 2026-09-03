import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

/**
 * Renders one form submission as a Markdown document to hand to whoever
 * builds the client's strategy.
 *
 * Pure, and deliberately free of `server-only` so it can be unit-tested —
 * same split as ./answers.ts. The route handler that serves it as a download
 * lives at app/api/clients/[id]/form-export/route.ts.
 *
 * Driven by the TEMPLATE's questions, not by the keys present in `answers`:
 * questions are rendered in the order the agency asked them, and an answer
 * left behind by a question that has since been deleted never appears in the
 * document.
 */

const UNANSWERED = "_(לא נענה)_";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The answer as it should read in the document, or null if there is nothing
 * to show. Compared against the empty string only AFTER String(), so the
 * number 0 — a real answer to "כמה עולה לך להשיג לקוח?" — survives.
 */
function answerText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function buildSubmissionMarkdown({
  clientName,
  templateName,
  submittedAt,
  questions,
  answers,
}: {
  clientName: string;
  templateName: string;
  /** Null when the link was issued but the client hasn't filled it in yet. */
  submittedAt: string | null;
  questions: QuestionnaireQuestion[];
  answers: Record<string, string | number | null>;
}): string {
  const lines: string[] = [
    `# ${templateName} — ${clientName}`,
    "",
    submittedAt ? `מולא בתאריך: ${formatDate(submittedAt)}` : "טרם מולא על ידי הלקוח.",
    "",
  ];

  for (const question of questions) {
    lines.push(`## ${question.label}`, "", answerText(answers[question.id]) ?? UNANSWERED, "");
  }

  return lines.join("\n");
}

// Anything Windows rejects in a filename, plus the characters that would
// terminate the quoted string in a Content-Disposition header.
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function slugifyForFilename(value: string): string {
  return value.replace(ILLEGAL_FILENAME_CHARS, "").trim().replace(/\s+/g, "-");
}

/**
 * Hebrew is kept as-is — the header writes this through `filename*=UTF-8''…`,
 * which is the encoding rule for exactly this case.
 */
export function submissionExportFilename(templateName: string, clientName: string, submittedAt: string | null): string {
  const date = (submittedAt ? new Date(submittedAt) : new Date()).toISOString().slice(0, 10);
  return `${slugifyForFilename(templateName)}-${slugifyForFilename(clientName)}-${date}.md`;
}
