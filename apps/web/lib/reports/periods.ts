import type { ReportPeriodKind } from "@dashboard-lior/shared";

// Pure period arithmetic for client-facing reports. No `server-only` and no
// Supabase import so it stays unit-testable.

export type ReportPeriod = {
  kind: ReportPeriodKind;
  /** First day, inclusive (yyyy-mm-dd). Stored as weekly_reports.week_start. */
  start: string;
  /** Last day, inclusive. Stored as weekly_reports.period_end. */
  end: string;
};

const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Bare `date` columns have no timezone; parsing at UTC midnight keeps them on the day they say. */
function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function periodFromStart(kind: ReportPeriodKind, startIso: string): ReportPeriod {
  const start = parseIso(startIso);

  if (kind === "month") {
    // Normalised to the 1st: a month report is identified by its month, and
    // the unique index on (client_id, week_start, period_kind) would
    // otherwise let the same month be stored twice under two start dates.
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { kind, start: isoOf(first), end: isoOf(last) };
  }

  // Same normalisation for weeks — snapped back to SUNDAY, the same week
  // boundary weekStartIso() uses for the questionnaire. Done in UTC here
  // rather than by calling weekStartIso: that function reads a Date's LOCAL
  // components (it starts from "now" in the user's zone), and feeding it a
  // date parsed at UTC midnight would land on the previous day for any
  // server running west of UTC.
  const sunday = new Date(start);
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(saturday.getUTCDate() + 6);
  return { kind, start: isoOf(sunday), end: isoOf(saturday) };
}

export function currentPeriod(kind: ReportPeriodKind, today: Date = new Date()): ReportPeriod {
  return periodFromStart(kind, isoOf(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))));
}

/** The `count` most recent periods, newest first — the picker on the reports tab. */
export function recentPeriods(kind: ReportPeriodKind, count: number, today: Date = new Date()): ReportPeriod[] {
  const periods: ReportPeriod[] = [];
  let cursor = currentPeriod(kind, today);

  for (let i = 0; i < count; i++) {
    periods.push(cursor);
    const previousEnd = parseIso(cursor.start);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    cursor = periodFromStart(kind, isoOf(previousEnd));
  }

  return periods;
}

export function formatPeriod(period: ReportPeriod): string {
  const start = parseIso(period.start);
  if (period.kind === "month") {
    return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }

  const end = parseIso(period.end);
  const day = (date: Date) => `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
  return `${day(start)} – ${day(end)}`;
}

/** Label for a stored row, whose period_end may be null on pre-phase-19 rows. */
export function formatStoredPeriod(kind: ReportPeriodKind, startIso: string): string {
  return formatPeriod(periodFromStart(kind, startIso));
}
