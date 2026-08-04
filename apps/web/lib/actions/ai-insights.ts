"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAnalyzer } from "@/lib/analyzer/run-analyzer";
import { buildWeeklyInsightPrompt } from "@/lib/ai-insights/build-prompt";
import { generateInsightText } from "@/lib/ai-insights/anthropic-client";

/**
 * Opt-in: reads only the deterministic analyzer's OUTPUT (never raw ad
 * account data) and asks Claude to phrase it for the client-facing weekly
 * report. Needs ANTHROPIC_API_KEY — the one dependency in this feature
 * that isn't mocked, since it's low-friction to obtain compared to a Meta
 * App or Green API instance.
 */
export async function generateAiInsight(clientId: string, weekStart: string) {
  const supabase = supabaseAdmin();

  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
  const { data: report } = await supabase
    .from("weekly_reports")
    .select("leads_closed_count, leads_matched_audience")
    .eq("client_id", clientId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const analyzerReport = await runAnalyzer(clientId);

  const prompt = buildWeeklyInsightPrompt({
    clientName: (client?.name as string) ?? "הלקוח",
    weekStart,
    rows: analyzerReport.rows,
    leadsClosedCount: (report?.leads_closed_count as number | undefined) ?? null,
    leadsMatchedAudience: (report?.leads_matched_audience as number | undefined) ?? null,
  });

  const { text, model } = await generateInsightText(prompt);

  await supabase.from("ai_insights").insert({
    client_id: clientId,
    week_start: weekStart,
    prompt_input_summary: { rows: analyzerReport.rows, leadsClosedCount: report?.leads_closed_count ?? null },
    generated_text: text,
    model,
  });

  revalidatePath(`/clients/${clientId}/reports`);
  return { text, model };
}

export async function saveInsightToReport(clientId: string, weekStart: string, text: string) {
  const supabase = supabaseAdmin();
  await supabase
    .from("weekly_reports")
    .upsert({ client_id: clientId, week_start: weekStart, report_html: text }, { onConflict: "client_id,week_start" });
  revalidatePath(`/clients/${clientId}/reports`);
}
