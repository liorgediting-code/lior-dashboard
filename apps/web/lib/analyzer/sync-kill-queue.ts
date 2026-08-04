import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAnalyzer } from "./run-analyzer";

/**
 * Runs the analyzer and upserts every KILL row into kill_queue_items.
 * Deliberately separate from runAnalyzer/the "see report" view: looking at
 * a report must never silently mutate the kill queue.
 */
export async function syncKillQueue(clientId: string) {
  const supabase = supabaseAdmin();
  const report = await runAnalyzer(clientId);

  const killRows = report.rows.filter((r) => r.verdict === "KILL");
  let inserted = 0;

  for (const row of killRows) {
    const { data: existing } = await supabase
      .from("kill_queue_items")
      .select("id")
      .eq("entity_type", "ad")
      .eq("entity_id", row.adId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) continue;

    await supabase.from("kill_queue_items").insert({
      client_id: clientId,
      entity_type: "ad",
      entity_id: row.adId,
      computed_status: "KILL",
      reason: row.reason,
      computed_cpl: row.cpl,
      max_cpl_at_detection: report.maxCpl,
    });
    inserted++;
  }

  return { checked: killRows.length, inserted };
}
