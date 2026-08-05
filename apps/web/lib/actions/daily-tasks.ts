"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateDailyTasks() {
  revalidatePath("/missions/business");
  revalidatePath("/");
}

export async function createDailyTaskFromForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("daily_tasks")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("daily_tasks").insert({ title, sort_order: nextSortOrder });
  if (error) throw new Error(error.message);
  revalidateDailyTasks();
}

export async function archiveDailyTask(taskId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("daily_tasks").update({ active: false }).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidateDailyTasks();
}

export async function toggleDailyTaskToday(taskId: string) {
  const supabase = supabaseAdmin();
  const completedOn = today();
  const { data: existing } = await supabase
    .from("daily_task_completions")
    .select("id")
    .eq("daily_task_id", taskId)
    .eq("completed_on", completedOn)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("daily_task_completions").delete().eq("id", existing.id as string);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("daily_task_completions").insert({ daily_task_id: taskId, completed_on: completedOn });
    if (error) throw new Error(error.message);
  }
  revalidateDailyTasks();
}
