"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadStatus } from "@dashboard-lior/shared";
import { planStatusDeletion } from "@/lib/crm/status-rules";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLeadStatus(clientId: string, label: string) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("lead_statuses")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase
    .from("lead_statuses")
    .insert({ client_id: clientId, label, kind: "open", sort_order: nextSortOrder, is_default: false });
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function renameLeadStatus(statusId: string, clientId: string, label: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_statuses").update({ label }).eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLeadStatus(statusId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { data: statuses, error: fetchError } = await supabase.from("lead_statuses").select("*").eq("client_id", clientId);
  if (fetchError) throw new Error(fetchError.message);

  const plan = planStatusDeletion((statuses ?? []) as LeadStatus[], statusId);

  await supabase.from("leads").update({ status_id: plan.reassignToStatusId }).eq("status_id", statusId);
  if (plan.newDefaultStatusId) {
    await supabase.from("lead_statuses").update({ is_default: true }).eq("id", plan.newDefaultStatusId);
  }
  const { error } = await supabase.from("lead_statuses").delete().eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function setDefaultLeadStatus(statusId: string, clientId: string) {
  const supabase = supabaseAdmin();
  await supabase.from("lead_statuses").update({ is_default: false }).eq("client_id", clientId).eq("is_default", true);
  const { error } = await supabase.from("lead_statuses").update({ is_default: true }).eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function reorderLeadStatus(statusId: string, clientId: string, direction: "up" | "down") {
  const supabase = supabaseAdmin();
  const { data: statuses } = await supabase
    .from("lead_statuses")
    .select("id, sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true });
  const rows = (statuses ?? []) as { id: string; sort_order: number }[];

  const index = rows.findIndex((r) => r.id === statusId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return;

  const a = rows[index];
  const b = rows[swapIndex];
  await supabase.from("lead_statuses").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("lead_statuses").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateCrm(clientId);
}
