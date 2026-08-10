import type { WebhookFieldMapping } from "@dashboard-lior/shared";

// Pure translation from "whatever the webhook sent" to "a leads row".
// Deliberately free of `server-only` and of any Supabase import so it can be
// unit-tested — same split as lib/crm/questionnaire-week.ts. The queries live
// in ./fetch-webhook-mapping.ts.

export const BUILT_IN_TARGETS = ["name", "phone", "email", "ignore"] as const;
export type BuiltInTarget = (typeof BUILT_IN_TARGETS)[number];

export function isBuiltInTarget(target: string): target is BuiltInTarget {
  return (BUILT_IN_TARGETS as readonly string[]).includes(target);
}

/**
 * Applied when the client has configured no mapping for a key. These are the
 * names Meta's own lead forms use, so the common case needs no setup at all —
 * configuring a mapping for one of these keys overrides the default.
 */
const DEFAULT_TARGETS: Record<string, BuiltInTarget> = {
  name: "name",
  full_name: "name",
  phone: "phone",
  phone_number: "phone",
  email: "email",
};

export type MappedLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  /**
   * Keyed by lead_columns.id for anything mapped to a custom column, which is
   * how CrmTable reads it. Unmapped keys keep their RAW source key so nothing
   * silently vanishes — they show up as suggestions in the mapping UI.
   */
  custom_fields: Record<string, string | number>;
};

/** Keys are matched case-insensitively, matching the unique index on the table. */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/** Webhook payloads carry booleans and nested objects too; only scalars are storable. */
function toScalar(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  // Meta sends every answer as an array of values, even single-answer fields.
  if (Array.isArray(value)) {
    const parts = value.map(toScalar).filter((part): part is string | number => part !== null);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

/**
 * Routes each incoming key to its configured destination.
 *
 * `knownColumnIds` guards against a mapping whose custom column was later
 * deleted: rather than writing to a column id nothing renders, the value
 * falls back to its raw key so it stays visible and re-mappable.
 */
export function applyFieldMappings(
  payload: Record<string, unknown>,
  mappings: Pick<WebhookFieldMapping, "source_key" | "target">[],
  knownColumnIds: ReadonlySet<string>
): MappedLead {
  const targetByKey = new Map(mappings.map((mapping) => [normalizeKey(mapping.source_key), mapping.target]));

  const result: MappedLead = { name: null, phone: null, email: null, custom_fields: {} };

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const value = toScalar(rawValue);
    if (value === null) continue;

    const key = normalizeKey(rawKey);
    const target = targetByKey.get(key) ?? DEFAULT_TARGETS[key];

    if (target !== undefined && isBuiltInTarget(target)) {
      if (target === "ignore") continue;
      // First non-empty wins: two source keys mapped to the same field
      // shouldn't have the later one blank out the earlier one.
      if (result[target] === null && String(value) !== "") result[target] = String(value);
      continue;
    }

    if (target && knownColumnIds.has(target)) {
      result.custom_fields[target] = value;
      continue;
    }

    result.custom_fields[rawKey] = value;
  }

  return result;
}

/**
 * Source keys that arrived on real leads but aren't mapped anywhere — the
 * candidate list shown in the mapping UI, so you configure the questions you
 * actually receive instead of typing them from memory.
 */
export function suggestUnmappedKeys(
  leadCustomFields: Record<string, unknown>[],
  mappings: Pick<WebhookFieldMapping, "source_key">[],
  knownColumnIds: ReadonlySet<string>
): string[] {
  const mapped = new Set(mappings.map((mapping) => normalizeKey(mapping.source_key)));
  const seen = new Map<string, string>();

  for (const fields of leadCustomFields) {
    for (const key of Object.keys(fields ?? {})) {
      // Keys that ARE column ids are already-routed values, not raw payload keys.
      if (knownColumnIds.has(key)) continue;
      const normalized = normalizeKey(key);
      if (mapped.has(normalized) || seen.has(normalized)) continue;
      seen.set(normalized, key);
    }
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b, "he"));
}
