"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Lead, LeadStage } from "@dashboard-lior/shared";

export async function createLead(input: {
  client_id: string;
  name?: string | null;
  phone?: string | null;
  source_ad_id?: string | null;
}) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      client_id: input.client_id,
      name: input.name ?? null,
      phone: input.phone ?? null,
      source_ad_id: input.source_ad_id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${input.client_id}/crm`);
  return data;
}

export async function updateLeadStage(leadId: string, clientId: string, stage: LeadStage, dealValue?: number | null) {
  const supabase = supabaseAdmin();
  const patch: Partial<Lead> = { stage };
  if (stage === "won" || stage === "lost") {
    patch.closed_at = new Date().toISOString();
    if (stage === "won" && dealValue != null) patch.deal_value = dealValue;
  }
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/crm`);
}
