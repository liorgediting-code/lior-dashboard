import type { LeadStatus, LeadStatusKind } from "@dashboard-lior/shared";

export function computeStatusChangePatch(
  kind: LeadStatusKind,
  dealValue?: number | null,
  now: Date = new Date()
): { closed_at?: string | null; deal_value?: number | null } {
  // Reverting to an open status must clear the closed-out state — a stale
  // closed_at/deal_value would keep counting toward revenue and CPL.
  if (kind === "open") return { closed_at: null, deal_value: null };
  const patch: { closed_at?: string; deal_value?: number } = { closed_at: now.toISOString() };
  if (kind === "won" && dealValue != null) patch.deal_value = dealValue;
  return patch;
}

export function planStatusDeletion(
  statuses: LeadStatus[],
  statusIdToDelete: string
): { reassignToStatusId: string; newDefaultStatusId?: string } {
  const target = statuses.find((s) => s.id === statusIdToDelete);
  if (!target) throw new Error("סטטוס לא נמצא");
  if (target.kind !== "open") throw new Error("לא ניתן למחוק סטטוס קבוע (נסגר/אבד)");

  const otherOpen = statuses.filter((s) => s.kind === "open" && s.id !== statusIdToDelete);
  if (otherOpen.length === 0) throw new Error("חייב להישאר לפחות סטטוס פתוח אחד");

  const reassignTarget = otherOpen.find((s) => s.is_default) ?? otherOpen[0];
  const needsNewDefault = target.is_default && !reassignTarget.is_default;

  return {
    reassignToStatusId: reassignTarget.id,
    newDefaultStatusId: needsNewDefault ? reassignTarget.id : undefined,
  };
}
