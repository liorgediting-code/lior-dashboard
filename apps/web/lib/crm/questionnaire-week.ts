import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

// Pure helpers, deliberately free of `server-only` (and of any Supabase
// import) so they can be unit-tested — same split as lib/crm/status-rules.ts.
// The server-side template lookup lives in ./questionnaire.ts.

/**
 * Sunday of the week `date` falls in, as yyyy-mm-dd.
 *
 * SUNDAY, matching the Israeli Sun–Thu work week — a client filling the
 * questionnaire on Thursday is reporting on the week that started Sunday.
 * The unique index is on (client_id, week_start), so every writer must agree
 * on this or two submissions in one week would create two rows. Keep this in
 * sync with the comments in the phase-18 migration and packages/shared.
 */
export function weekStartIso(date: Date = new Date()): string {
  // Built in UTC from the local Y/M/D so the result is the Sunday of the
  // user's local week, not of whatever week UTC happens to be in.
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // getUTCDay(): 0 = Sunday, so it doubles as "days since the week started".
  utc.setUTCDate(utc.getUTCDate() - utc.getUTCDay());
  return utc.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const format = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" });
  return `${format(start)} – ${format(end)}`;
}

/** Drops rows with a blank label and re-slugs missing ids so answers stay addressable. */
export function normalizeQuestions(raw: unknown): QuestionnaireQuestion[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
    .map((row, index) => ({
      id: String(row.id ?? "").trim() || `q${index + 1}`,
      label: String(row.label ?? "").trim(),
      type: (["text", "textarea", "number", "rating"] as const).includes(row.type as never)
        ? (row.type as QuestionnaireQuestion["type"])
        : "text",
      required: row.required === true || row.required === "true",
    }))
    .filter((question) => question.label !== "");
}
