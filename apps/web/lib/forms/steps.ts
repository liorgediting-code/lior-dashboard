import type { WhatsappAutomationStep } from "@dashboard-lior/shared";

export type StepUnit = "minutes" | "hours" | "days";

export type MessageStepRow = { type: "message"; text: string };
export type WaitStepRow = { type: "wait"; amount: number; unit: StepUnit };
export type StepRow = MessageStepRow | WaitStepRow;

const UNIT_TO_MINUTES: Record<StepUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/** Picks the largest unit that divides wait_minutes evenly, defaulting to minutes. */
function minutesToUnit(minutes: number): { amount: number; unit: StepUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

export function stepToRow(step: WhatsappAutomationStep): StepRow {
  if (step.type === "wait") {
    return { type: "wait", ...minutesToUnit(step.wait_minutes ?? 0) };
  }
  return { type: "message", text: step.text ?? "" };
}

export function rowToStep(row: StepRow): WhatsappAutomationStep {
  if (row.type === "wait") {
    return { type: "wait", wait_minutes: Math.max(0, Math.round(row.amount * UNIT_TO_MINUTES[row.unit])) };
  }
  return { type: "message", text: row.text };
}

/** Drops message rows with blank text before serializing. */
export function serializeSteps(rows: StepRow[]): string {
  const cleaned = rows.filter((row) => row.type === "wait" || row.text.trim() !== "");
  return JSON.stringify(cleaned.map(rowToStep));
}
