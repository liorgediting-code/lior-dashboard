"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { CRM_THEME_COLORS, type CrmThemeColor } from "@dashboard-lior/shared";

export async function setCrmThemeColor(clientId: string, color: CrmThemeColor) {
  assertCrmAccess(clientId);
  if (!CRM_THEME_COLORS.includes(color)) throw new Error("צבע לא תקין");

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("clients").update({ crm_theme_color: color }).eq("id", clientId);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}
