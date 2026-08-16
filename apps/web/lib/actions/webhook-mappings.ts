"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { isBuiltInTarget } from "@/lib/crm/webhook-mapping";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadColumnType } from "@dashboard-lior/shared";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

/**
 * Select-then-write rather than `.upsert()`: the unique index is on
 * `lower(source_key)`, an EXPRESSION index, and supabase-js's `onConflict`
 * option can only name plain columns. The match is done in JS rather than
 * with `.ilike()` because ilike would treat `_` in a key like `full_name` as
 * a wildcard and could match the wrong row.
 */
async function upsertWebhookMapping(supabase: SupabaseClient, clientId: string, sourceKey: string, target: string) {
  const { data: rows } = await supabase.from("webhook_field_mappings").select("id, source_key").eq("client_id", clientId);
  const existing = ((rows ?? []) as { id: string; source_key: string }[]).find(
    (row) => row.source_key.trim().toLowerCase() === sourceKey.toLowerCase()
  );

  const { error } = existing
    ? await supabase.from("webhook_field_mappings").update({ target }).eq("id", existing.id)
    : await supabase.from("webhook_field_mappings").insert({ client_id: clientId, source_key: sourceKey, target });
  if (error) throw new Error(error.message);
}

/** Upserts one source_key → target rule. */
export async function setWebhookFieldMapping(clientId: string, sourceKey: string, target: string) {
  assertCrmAccess(clientId);

  const trimmedKey = sourceKey.trim();
  if (!trimmedKey) throw new Error("חסר שם שדה");
  if (!target.trim()) throw new Error("חסר יעד");

  const supabase = supabaseAdmin();

  if (!isBuiltInTarget(target)) {
    // A non-built-in target must be one of THIS client's columns — otherwise
    // a stray id would route a lead's data into another client's column.
    const { data: column } = await supabase
      .from("lead_columns")
      .select("id")
      .eq("id", target)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!column) throw new Error("העמודה לא נמצאה אצל הלקוח הזה");
  }

  await upsertWebhookMapping(supabase, clientId, trimmedKey, target);

  revalidateCrm(clientId);
}

/**
 * Creates a column — named however the agency chooses, not necessarily the
 * raw webhook key — and routes this source key to it in the same action,
 * instead of making the agency do both steps by hand. Upserts the mapping
 * rather than always inserting so this also works for a key that already
 * has a mapping (e.g. switching it from "ignore" to a brand-new column).
 */
export async function createColumnFromWebhookKey(
  clientId: string,
  sourceKey: string,
  columnName?: string,
  columnType: LeadColumnType = "text"
) {
  assertCrmAccess(clientId);

  const trimmedKey = sourceKey.trim();
  if (!trimmedKey) throw new Error("חסר שם שדה");
  const trimmedName = (columnName ?? trimmedKey).trim();
  if (!trimmedName) throw new Error("חסר שם עמודה");

  const supabase = supabaseAdmin();

  const { data: existingColumns } = await supabase
    .from("lead_columns")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existingColumns?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { data: column, error: columnError } = await supabase
    .from("lead_columns")
    .insert({ client_id: clientId, name: trimmedName, type: columnType, sort_order: nextSortOrder })
    .select("id")
    .single();
  if (columnError || !column) throw new Error(columnError?.message ?? "יצירת העמודה נכשלה");

  await upsertWebhookMapping(supabase, clientId, trimmedKey, column.id as string);

  revalidateCrm(clientId);
}

export async function deleteWebhookFieldMapping(mappingId: string, clientId: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("webhook_field_mappings").delete().eq("id", mappingId).eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidateCrm(clientId);
}
