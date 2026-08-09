"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function regenerateWebhookSecretAction(clientId: string): Promise<string> {
  const supabase = supabaseAdmin();
  const secret = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("clients").update({ webhook_secret: secret }).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/edit`);
  return secret;
}
