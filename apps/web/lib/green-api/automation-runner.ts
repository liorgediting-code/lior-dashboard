import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getGreenApiClient } from "./index";
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";

/**
 * A Next.js route handler can't literally sleep through a "wait" step, so
 * each automation run tracks current_step_index/next_action_at and this
 * function advances any run that's due — meant to be called from
 * /api/cron/whatsapp-automation-tick.
 */
export async function tickWhatsappAutomations() {
  const supabase = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: dueRuns } = await supabase
    .from("whatsapp_automation_runs")
    .select("*, whatsapp_automations(*), leads(*)")
    .eq("status", "active")
    .lte("next_action_at", nowIso);

  let processed = 0;

  for (const run of dueRuns ?? []) {
    const automation = run.whatsapp_automations as { steps: WhatsappAutomationStep[]; green_api_instance_id: string | null } | null;
    const lead = run.leads as { phone: string | null } | null;
    if (!automation) continue;

    const steps = automation.steps ?? [];
    let index = run.current_step_index as number;

    if (index >= steps.length) {
      await supabase.from("whatsapp_automation_runs").update({ status: "completed" }).eq("id", run.id as string);
      continue;
    }

    const step = steps[index];
    if (step.type === "message") {
      if (lead?.phone && automation.green_api_instance_id) {
        const client = getGreenApiClient();
        await client.sendTextMessage(automation.green_api_instance_id, lead.phone, step.text ?? "");
      }
      index += 1;
    } else {
      index += 1;
    }

    let nextActionAt = new Date();
    if (steps[index]?.type === "wait") {
      const waitMinutes = steps[index].wait_minutes ?? 0;
      nextActionAt = new Date(Date.now() + waitMinutes * 60 * 1000);
      index += 1; // the wait step's delay has been applied, move past it
    }

    const status = index >= steps.length ? "completed" : "active";
    await supabase
      .from("whatsapp_automation_runs")
      .update({ current_step_index: index, next_action_at: nextActionAt.toISOString(), status })
      .eq("id", run.id as string);

    processed++;
  }

  return { processed };
}

export async function startAutomationRun(automationId: string, leadId: string) {
  const supabase = supabaseAdmin();
  await supabase.from("whatsapp_automation_runs").insert({
    automation_id: automationId,
    lead_id: leadId,
    current_step_index: 0,
    next_action_at: new Date().toISOString(),
    status: "active",
  });
}
