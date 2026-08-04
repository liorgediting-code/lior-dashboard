import type { AnalyzerReportRow } from "@/lib/analyzer/run-analyzer";

export interface WeeklyInsightInput {
  clientName: string;
  weekStart: string;
  rows: AnalyzerReportRow[];
  leadsClosedCount: number | null;
  leadsMatchedAudience: number | null;
}

/**
 * Builds the prompt from the deterministic analyzer's OUTPUT only (ad
 * name/spend/leads/CPL/verdict, closed-lead counts) — never raw ad-account
 * data — so the AI panel can only phrase what the deterministic logic
 * already decided, not influence the KILL/SUSPECT/WINNER classification.
 */
export function buildWeeklyInsightPrompt(input: WeeklyInsightInput): string {
  const rowsSummary = input.rows
    .map((r) => `- ${r.adName}: spend ₪${r.spend}, ${r.leads} לידים, CPL ₪${r.cpl?.toFixed(2) ?? "—"}, סטטוס ${r.verdict}`)
    .join("\n");

  return [
    `כתוב סיכום שבועי קצר וברור ללקוח "${input.clientName}" עבור השבוע המתחיל ב-${input.weekStart}.`,
    `אל תמציא נתונים — התבסס אך ורק על הנתונים הבאים, שכבר חושבו על ידי מנוע ניתוח דטרמיניסטי:`,
    "",
    rowsSummary || "(אין נתוני מודעות לשבוע זה)",
    "",
    `לידים שנסגרו: ${input.leadsClosedCount ?? "לא ידוע"}`,
    `לידים שתאמו לקהל היעד: ${input.leadsMatchedAudience ?? "לא ידוע"}`,
    "",
    "כתוב בעברית, בטון מקצועי וידידותי, 3-5 משפטים, ללא ז'רגון טכני מיותר.",
  ].join("\n");
}
