"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";

function revalidateWhatsapp(clientId: string) {
  revalidatePath(`/clients/${clientId}/whatsapp`);
  revalidatePath(`/client/${clientId}/automations`);
}

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
  revalidateWhatsapp(input.client_id);
}

export async function updateAutomation(id: string, clientId: string, steps: WhatsappAutomationStep[]) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("whatsapp_automations").update({ steps }).eq("id", id).eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidateWhatsapp(clientId);
}
