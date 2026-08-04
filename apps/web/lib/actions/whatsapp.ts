"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";

export async function createAutomation(input: {
  client_id: string;
  trigger: string;
  steps: WhatsappAutomationStep[];
  green_api_instance_id?: string | null;
}) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("whatsapp_automations").insert({
    client_id: input.client_id,
    trigger: input.trigger,
    steps: input.steps,
    green_api_instance_id: input.green_api_instance_id ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${input.client_id}/whatsapp`);
}

export async function updateAutomation(id: string, clientId: string, steps: WhatsappAutomationStep[]) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("whatsapp_automations").update({ steps }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/whatsapp`);
}
