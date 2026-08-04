import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTelegramAlert } from "./telegram";
import { isStageOverdue } from "@/lib/sop/stage-machine";
import type { SopBottleneck } from "@dashboard-lior/shared";

const GATE_STUCK_DAYS_THRESHOLD = 3;

async function logAndSend(clientId: string | null, alertType: "questionnaire_overdue" | "gate_stuck" | "cpl_breach", message: string) {
  const supabase = supabaseAdmin();
  const { sent } = await sendTelegramAlert(message);
  await supabase.from("alerts_log").insert({
    client_id: clientId,
    alert_type: alertType,
    message,
    channel: "telegram",
    sent_at: sent ? new Date().toISOString() : null,
  });
}

/**
 * Owner-facing alerts (spec idea 5): questionnaire not filled within 48h,
 * a gate stuck more than GATE_STUCK_DAYS_THRESHOLD days, or a fresh CPL
 * threshold breach in the kill queue. Meant to run from a cron tick;
 * re-running is safe since alerts_log isn't deduped here — the agency
 * owner can mark alerts resolved via resolved_at once wired to a UI action.
 */
export async function runAlertsCheck() {
  const supabase = supabaseAdmin();
  let sent = 0;

  const { data: stage0Clients } = await supabase.from("clients").select("id, name, sop_stage, sop_stage_updated_at").eq("sop_stage", 0);
  for (const client of stage0Clients ?? []) {
    if (isStageOverdue(0, client.sop_stage_updated_at as string)) {
      await logAndSend(client.id as string, "questionnaire_overdue", `⏰ ${client.name}: השאלון עדיין לא מולא אחרי 48 שעות`);
      sent++;
    }
  }

  const { data: bottlenecks } = await supabase.from("sop_bottlenecks").select("*");
  for (const row of (bottlenecks ?? []) as SopBottleneck[]) {
    if (row.gate_status === "pending" && row.days_stuck >= GATE_STUCK_DAYS_THRESHOLD) {
      await logAndSend(
        row.client_id,
        "gate_stuck",
        `🚧 ${row.name}: תקוע ב-Gate ${row.gate_number} כבר ${row.days_stuck} ימים`
      );
      sent++;
    }
  }

  const { data: freshKills } = await supabase
    .from("kill_queue_items")
    .select("id, client_id, computed_status, reason, clients(name)")
    .eq("status", "pending")
    .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  for (const item of freshKills ?? []) {
    const clientName = (item.clients as { name: string } | null)?.name ?? "לקוח";
    await logAndSend(item.client_id as string, "cpl_breach", `🔴 ${clientName}: חריגת סף CPL זוהתה — ${item.reason}`);
    sent++;
  }

  return { sent };
}
