"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { isBuiltInTarget } from "@/lib/crm/webhook-mapping";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

/**
 * Upserts one source_key → target rule.
 *
 * Select-then-write rather than `.upsert()`: the unique index is on
 * `lower(source_key)`, an EXPRESSION index, and supabase-js's `onConflict`
 * option can only name plain columns. The match is done in JS rather than
 * with `.ilike()` because ilike would treat `_` in a key like `full_name` as
 * a wildcard and could match the wrong row.
 */
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

  const { data: rows } = await supabase.from("webhook_field_mappings").select("id, source_key").eq("client_id", clientId);
  const existing = ((rows ?? []) as { id: string; source_key: string }[]).find(
    (row) => row.source_key.trim().toLowerCase() === trimmedKey.toLowerCase()
  );

  const { error } = existing
    ? await supabase.from("webhook_field_mappings").update({ target }).eq("id", existing.id)
    : await supabase.from("webhook_field_mappings").insert({ client_id: clientId, source_key: trimmedKey, target });
  if (error) throw new Error(error.message);

  revalidateCrm(clientId);
}

/**
 * One-click version of "create a column, then map this key to it" — for a
 * suggested key that arrived on a real lead but has nowhere configured to
 * go yet. Creates a text column named after the key and routes it in the
 * same action, instead of making the agency do both steps by hand.
 */
export async function createColumnFromWebhookKey(clientId: string, sourceKey: string) {
  assertCrmAccess(clientId);

  const trimmedKey = sourceKey.trim();
  if (!trimmedKey) throw new Error("חסר שם שדה");

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
    .insert({ client_id: clientId, name: trimmedKey, type: "text", sort_order: nextSortOrder })
    .select("id")
    .single();
  if (columnError || !column) throw new Error(columnError?.message ?? "יצירת העמודה נכשלה");

  const { error: mappingError } = await supabase
    .from("webhook_field_mappings")
    .insert({ client_id: clientId, source_key: trimmedKey, target: column.id as string });
  if (mappingError) throw new Error(mappingError.message);

  revalidateCrm(clientId);
}

export async function deleteWebhookFieldMapping(mappingId: string, clientId: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("webhook_field_mappings").delete().eq("id", mappingId).eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidateCrm(clientId);
}
