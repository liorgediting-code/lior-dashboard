"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GoalMetric } from "@dashboard-lior/shared";

export async function setGoalFromForm(metric: GoalMetric, formData: FormData) {
  const targetValue = Number(formData.get("target_value"));
  if (!Number.isFinite(targetValue) || targetValue < 0) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("goals").upsert({ metric, target_value: targetValue }, { onConflict: "metric" });
  if (error) throw new Error(error.message);
  revalidatePath("/goals");
}
