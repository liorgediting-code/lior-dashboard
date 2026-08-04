import { getSupabaseClient } from "../supabase-client.js";

/**
 * Reads the persisted kill_queue_items table (KILL verdicts, pending
 * manual approval) across every client. SUSPECT verdicts are intentionally
 * not duplicated here — they're transient (only computed live when the
 * analyzer runs, see apps/web/lib/analyzer), so persisting them a second
 * time in this package would risk drifting from the deterministic logic.
 * Use the per-client "analyzer" page in the web app for the live
 * KILL/SUSPECT/WINNER report including SUSPECT rows.
 */
export async function getKillQueue() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("kill_queue_items")
    .select("*, clients(name)")
    .eq("status", "pending")
    .order("detected_at", { ascending: false });

  if (error) throw new Error(error.message);
  return { pending_kill_items: data ?? [] };
}
