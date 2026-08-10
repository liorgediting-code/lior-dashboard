import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dashboard-lior/shared";
import { weekStartIso } from "./questionnaire-week";

/**
 * Shared state for the portal's tab bar: the notifications badge, whether
 * there's anything behind the automations/reports tabs at all, and whether
 * this week's questionnaire still needs filling.
 *
 * Every portal page spreads the whole result into <PortalTabs>, so adding a
 * field here reaches all of them at once.
 */
export async function getPortalTabsData(supabase: SupabaseClient<Database>, clientId: string) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartIso();

  const [{ data: leads }, { data: statuses }, { count: automationsCount }, { count: questionnaireCount }, { count: reportsCount }] =
    await Promise.all([
      supabase.from("leads").select("id, status_id, follow_up_at").eq("client_id", clientId),
      supabase.from("lead_statuses").select("id, kind").eq("client_id", clientId),
      supabase.from("whatsapp_automations").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase
        .from("questionnaire_responses")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("week_start", weekStart),
      // Only reports actually sent to the client — a draft the agency is
      // still writing must not appear in the portal.
      supabase.from("weekly_reports").select("id", { count: "exact", head: true }).eq("client_id", clientId).not("sent_at", "is", null),
    ]);

  const openStatusIds = new Set((statuses ?? []).filter((s) => s.kind === "open").map((s) => s.id as string));
  const notificationsCount = (leads ?? []).filter(
    (l) => openStatusIds.has(l.status_id as string) && l.follow_up_at && (l.follow_up_at as string) <= todayIso
  ).length;

  return {
    notificationsCount,
    showAutomations: (automationsCount ?? 0) > 0,
    questionnairePending: (questionnaireCount ?? 0) === 0,
    showReports: (reportsCount ?? 0) > 0,
  };
}
