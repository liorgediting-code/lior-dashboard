"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { PORTAL_THEME_COLORS, type PortalThemeColor } from "@dashboard-lior/shared";

export async function setPortalThemeColor(clientId: string, color: PortalThemeColor) {
  assertCrmAccess(clientId);
  if (!PORTAL_THEME_COLORS.includes(color)) throw new Error("צבע לא תקין");

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("clients").update({ portal_theme_color: color }).eq("id", clientId);
  if (error) throw new Error(error.message);

  // Revalidates every page under client/[clientId] — the theme lives on the
  // portal layout, not just the CRM page — plus the admin CRM page that
  // hosts the same color picker.
  revalidatePath(`/client/${clientId}`, "layout");
  revalidatePath(`/clients/${clientId}/crm`);
}
