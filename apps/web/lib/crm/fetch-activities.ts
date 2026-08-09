import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadActivity, Database } from "@dashboard-lior/shared";

export async function fetchActivitiesByLead(supabase: SupabaseClient<Database>, clientId: string): Promise<Record<string, LeadActivity[]>> {
  const { data } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const byLead: Record<string, LeadActivity[]> = {};
  for (const activity of (data ?? []) as LeadActivity[]) {
    (byLead[activity.lead_id] ??= []).push(activity);
  }
  return byLead;
}
