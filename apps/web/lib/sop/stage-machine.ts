// Canonical definition of the 9-stage SOP (0-8). Every other SOP feature —
// overdue banners, alerts, the bottleneck view, magic links — reads from
// this single source of truth instead of hardcoding stage numbers again.

export type GateNumber = 1 | 2 | 3 | 4;

export interface SopDeadline {
  type: "hours" | "calendar_days";
  amount: number;
}

export interface SopStageDefinition {
  stage: number;
  key: string;
  label: string;
  /** Trigger that moves a client INTO this stage. */
  trigger: string;
  /** Automatic action fired on entering this stage. */
  autoAction: string;
  /** Gate that must be approved before advancing past this stage, if any. */
  gateNumber: GateNumber | null;
  deadline?: SopDeadline;
}

export const SOP_STAGES: SopStageDefinition[] = [
  {
    stage: 0,
    key: "payment_confirmed",
    label: "תשלום אושר",
    trigger: "תשלום אושר",
    autoAction: "שליחת שאלון + טיימר תזכורת 48 שעות",
    gateNumber: null,
    deadline: { type: "hours", amount: 48 },
  },
  {
    stage: 1,
    key: "questionnaire_filled",
    label: "שאלון מולא",
    trigger: "שאלון מולא",
    autoAction: "יצירת דראפט אסטרטגיה",
    gateNumber: null,
  },
  {
    stage: 2,
    key: "strategy_call",
    label: "שיחת אסטרטגיה",
    trigger: "שיחת אסטרטגיה בוצעה",
    autoAction: "שדה חובה: העלאת הקלטה + תמלול",
    gateNumber: null,
  },
  {
    stage: 3,
    key: "strategy_built",
    label: "בניית אסטרטגיה",
    trigger: "אסטרטגיה נבנתה",
    autoAction: "דדליין 3 ימי עסקים, באנר overdue אם עבר",
    gateNumber: 1,
    deadline: { type: "calendar_days", amount: 3 },
  },
  {
    stage: 4,
    key: "scripts",
    label: "תסריטים",
    trigger: "תסריטים נכתבו",
    autoAction: "3-5 תסריטים לאישור",
    gateNumber: 2,
  },
  {
    stage: 5,
    key: "filming",
    label: "צילום",
    trigger: "Gate 2 אושר",
    autoAction: "חלון 3 ימים לתיאום, אסקלציה אוטומטית",
    gateNumber: null,
    deadline: { type: "calendar_days", amount: 3 },
  },
  {
    stage: 6,
    key: "campaign_build",
    label: "בניית קמפיין",
    trigger: "צילום הושלם",
    autoAction: "תבנית TOFU/MOFU/BOFU קבועה",
    gateNumber: 3,
  },
  {
    stage: 7,
    key: "live",
    label: "הרצה",
    trigger: "Gate 3 אושר",
    autoAction: "הקמפיין רץ",
    gateNumber: null,
  },
  {
    stage: 8,
    key: "ongoing",
    label: "ניהול שוטף",
    trigger: "ניהול שוטף החל",
    autoAction: "יום קבוע בשבוע, טופס שבועי, דוח בפורמט קבוע",
    gateNumber: 4,
  },
];

export function getStageDefinition(stage: number): SopStageDefinition {
  const def = SOP_STAGES.find((s) => s.stage === stage);
  if (!def) throw new Error(`Unknown SOP stage: ${stage}`);
  return def;
}

export function nextStage(current: number): number | null {
  return current < 8 ? current + 1 : null;
}

/** Stages that sit behind a gate — mirrors the `sop_bottlenecks` DB view. */
export const GATE_BLOCKING_STAGES = SOP_STAGES.filter((s) => s.gateNumber !== null).map((s) => s.stage);

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isStageOverdue(stage: number, stageUpdatedAt: string, now: Date = new Date()): boolean {
  const def = getStageDefinition(stage);
  if (!def.deadline) return false;
  const updated = new Date(stageUpdatedAt);
  if (def.deadline.type === "hours") {
    return now.getTime() - updated.getTime() > def.deadline.amount * 60 * 60 * 1000;
  }
  // calendar_days (spec's "business days" is approximated as calendar days
  // for simplicity; tune here if strict business-day counting is needed)
  return now > addCalendarDays(updated, def.deadline.amount);
}
