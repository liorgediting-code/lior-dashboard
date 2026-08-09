import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dashboard-lior/shared";

/** Shared counts for the portal's tab bar (notifications badge, whether to show the automations tab at all). */
export async function getPortalTabsData(supabase: SupabaseClient<Database>, clientId: string) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: leads }, { data: statuses }, { count: automationsCount }] = await Promise.all([
    supabase.from("leads").select("id, status_id, follow_up_at").eq("client_id", clientId),
    supabase.from("lead_statuses").select("id, kind").eq("client_id", clientId),
    supabase.from("whatsapp_automations").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  const openStatusIds = new Set((statuses ?? []).filter((s) => s.kind === "open").map((s) => s.id as string));
  const notificationsCount = (leads ?? []).filter(
    (l) => openStatusIds.has(l.status_id as string) && l.follow_up_at && (l.follow_up_at as string) <= todayIso
  ).length;

  return { notificationsCount, showAutomations: (automationsCount ?? 0) > 0 };
}
