"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MissionPriority, MissionStatus } from "@dashboard-lior/shared";

export async function createMission(input: {
  client_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: MissionPriority;
}) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("missions").insert({
    client_id: input.client_id,
    title: input.title,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    priority: input.priority ?? "medium",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${input.client_id}/missions`);
  revalidatePath("/missions");
}

export async function updateMissionStatus(missionId: string, status: MissionStatus) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("missions").update({ status }).eq("id", missionId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions");
}
