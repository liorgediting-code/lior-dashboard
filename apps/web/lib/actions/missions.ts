"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MissionPriority, MissionStatus } from "@dashboard-lior/shared";

function revalidateMissions(clientId: string | null) {
  if (clientId) revalidatePath(`/clients/${clientId}/missions`);
  revalidatePath("/missions");
  revalidatePath("/missions/business");
}

export async function createMission(input: {
  client_id?: string | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: MissionPriority;
}) {
  const supabase = supabaseAdmin();
  const clientId = input.client_id ?? null;
  const { error } = await supabase.from("missions").insert({
    client_id: clientId,
    title: input.title,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    priority: input.priority ?? "medium",
  });
  if (error) throw new Error(error.message);
  revalidateMissions(clientId);
}

export async function createBusinessMissionFromForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await createMission({
    client_id: null,
    title,
    description: String(formData.get("description") ?? "") || null,
    due_date: String(formData.get("due_date") ?? "") || null,
    priority: (formData.get("priority") as MissionPriority) ?? "medium",
  });
}

export async function updateMissionStatus(missionId: string, status: MissionStatus) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("missions").update({ status }).eq("id", missionId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions");
  revalidatePath("/missions/business");
}
