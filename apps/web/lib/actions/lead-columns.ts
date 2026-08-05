"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadColumnType } from "@dashboard-lior/shared";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLeadColumn(clientId: string, name: string, type: LeadColumnType) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("lead_columns")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("lead_columns").insert({ client_id: clientId, name, type, sort_order: nextSortOrder });
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function renameLeadColumn(columnId: string, clientId: string, name: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_columns").update({ name }).eq("id", columnId).eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLeadColumn(columnId: string, clientId: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_columns").delete().eq("id", columnId).eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function reorderLeadColumn(columnId: string, clientId: string, direction: "up" | "down") {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { data: columns } = await supabase
    .from("lead_columns")
    .select("id, sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true });
  const rows = (columns ?? []) as { id: string; sort_order: number }[];

  const index = rows.findIndex((r) => r.id === columnId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return;

  const a = rows[index];
  const b = rows[swapIndex];
  await supabase.from("lead_columns").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("lead_columns").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateCrm(clientId);
}
