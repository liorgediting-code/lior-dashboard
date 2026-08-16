"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import type { CrmColumnLayoutEntry, LeadColumn } from "@dashboard-lior/shared";
import { resolveColumnLayout, moveColumn, toggleColumnHidden, toStoredLayout } from "@/lib/crm/column-layout";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

async function loadState(clientId: string) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("crm_column_layout").eq("id", clientId).single(),
    supabase.from("lead_columns").select("id, name, sort_order").eq("client_id", clientId),
  ]);
  const storedLayout = (client?.crm_column_layout as CrmColumnLayoutEntry[] | null) ?? null;
  const customColumns = (columns ?? []) as Pick<LeadColumn, "id" | "name" | "sort_order">[];
  return { supabase, storedLayout, customColumns };
}

async function saveLayout(clientId: string, layout: CrmColumnLayoutEntry[]) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("clients").update({ crm_column_layout: layout }).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function moveCrmColumn(clientId: string, key: string, direction: "up" | "down") {
  assertCrmAccess(clientId);
  const { storedLayout, customColumns } = await loadState(clientId);
  const resolved = resolveColumnLayout(storedLayout, customColumns);
  const moved = moveColumn(resolved, key, direction);
  await saveLayout(clientId, toStoredLayout(moved));
}

export async function toggleCrmColumnVisibility(clientId: string, key: string) {
  assertCrmAccess(clientId);
  const { storedLayout, customColumns } = await loadState(clientId);
  const resolved = resolveColumnLayout(storedLayout, customColumns);
  const toggled = toggleColumnHidden(resolved, key);
  await saveLayout(clientId, toStoredLayout(toggled));
}
