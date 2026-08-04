"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AppSettings } from "@dashboard-lior/shared";

export async function getAppSettings(): Promise<AppSettings | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  return data as AppSettings | null;
}

export async function updateMetaSettingsFromForm(formData: FormData) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert({
    id: 1,
    meta_system_user_token: String(formData.get("meta_system_user_token") ?? "").trim() || null,
    meta_business_id: String(formData.get("meta_business_id") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
