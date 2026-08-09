"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadActivityKind } from "@dashboard-lior/shared";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLeadActivity(leadId: string, clientId: string, kind: LeadActivityKind, note: string) {
  assertCrmAccess(clientId);
  if (!note.trim()) throw new Error("יש להזין תוכן");

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, client_id: clientId, kind, note: note.trim() });
  if (error) throw new Error(error.message);

  revalidateCrm(clientId);
}

export async function createLeadActivityFromForm(leadId: string, clientId: string, formData: FormData) {
  await createLeadActivity(leadId, clientId, String(formData.get("kind") ?? "note") as LeadActivityKind, String(formData.get("note") ?? ""));
}
