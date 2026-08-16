import type { CrmColumnLayoutEntry, LeadColumn } from "@dashboard-lior/shared";

// Pure layout-resolution logic, free of Supabase — unit-testable the same
// way as webhook-mapping.ts. The queries/writes live in
// lib/actions/crm-layout.ts.

export type BuiltInColumnKey = "name" | "phone" | "email" | "status" | "source" | "deal_value" | "follow_up";

/**
 * name/status are excluded from `hidden` support (see resolveColumnLayout) —
 * without a visible name there's no way to identify a row, and without a
 * visible status the workflow this whole table exists for breaks.
 */
export const BUILT_IN_CRM_COLUMNS: { key: BuiltInColumnKey; label: string; lockedVisible: boolean }[] = [
  { key: "name", label: "שם", lockedVisible: true },
  { key: "phone", label: "טלפון", lockedVisible: false },
  { key: "email", label: "אימייל", lockedVisible: false },
  { key: "status", label: "סטטוס", lockedVisible: true },
  { key: "source", label: "מקור", lockedVisible: false },
  { key: "deal_value", label: "שווי עסקה", lockedVisible: false },
  { key: "follow_up", label: "מעקב הבא", lockedVisible: false },
];

export type ResolvedColumn = {
  key: string;
  label: string;
  hidden: boolean;
  isBuiltIn: boolean;
  /** Visibility can't be toggled (name/status); order still can be. */
  lockedVisible: boolean;
};

/**
 * Merges the stored layout (if any) with the columns that actually exist
 * right now, so a deleted custom column silently drops out and a new one
 * (or a first-time-configured built-in) appears at the end instead of the
 * table 500ing on a stale key.
 */
export function resolveColumnLayout(
  storedLayout: CrmColumnLayoutEntry[] | null,
  customColumns: Pick<LeadColumn, "id" | "name" | "sort_order">[]
): ResolvedColumn[] {
  const sortedCustom = [...customColumns].sort((a, b) => a.sort_order - b.sort_order);

  const known = new Map<string, ResolvedColumn>();
  for (const col of BUILT_IN_CRM_COLUMNS) {
    known.set(col.key, { key: col.key, label: col.label, hidden: false, isBuiltIn: true, lockedVisible: col.lockedVisible });
  }
  for (const col of sortedCustom) {
    known.set(col.id, { key: col.id, label: col.name, hidden: false, isBuiltIn: false, lockedVisible: false });
  }

  const defaultOrder = [...BUILT_IN_CRM_COLUMNS.map((c) => c.key), ...sortedCustom.map((c) => c.id)];

  const orderedKeys = storedLayout?.length
    ? [...storedLayout.map((entry) => entry.key).filter((key) => known.has(key)), ...defaultOrder.filter((key) => !storedLayout.some((e) => e.key === key))]
    : defaultOrder;

  const hiddenByKey = new Map((storedLayout ?? []).map((entry) => [entry.key, entry.hidden]));

  return orderedKeys.map((key) => {
    const base = known.get(key)!;
    const hidden = base.lockedVisible ? false : (hiddenByKey.get(key) ?? false);
    return { ...base, hidden };
  });
}

/** Strips derived fields back down to what's actually persisted. */
export function toStoredLayout(resolved: ResolvedColumn[]): CrmColumnLayoutEntry[] {
  return resolved.map((col) => ({ key: col.key, hidden: col.hidden }));
}

export function moveColumn(resolved: ResolvedColumn[], key: string, direction: "up" | "down"): ResolvedColumn[] {
  const index = resolved.findIndex((col) => col.key === key);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= resolved.length) return resolved;

  const next = [...resolved];
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

export function toggleColumnHidden(resolved: ResolvedColumn[], key: string): ResolvedColumn[] {
  return resolved.map((col) => (col.key === key && !col.lockedVisible ? { ...col, hidden: !col.hidden } : col));
}
