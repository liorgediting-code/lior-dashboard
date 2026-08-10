"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAnalyzer } from "@/lib/analyzer/run-analyzer";
import { buildWeeklyInsightPrompt } from "@/lib/ai-insights/build-prompt";
import { generateInsightText } from "@/lib/ai-insights/anthropic-client";
import { periodFromStart } from "@/lib/reports/periods";

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
    // Scoped to the weekly row: since phase 19 a monthly report shares the
    // week_start column, and a month beginning on a Sunday would otherwise
    // match two rows and make maybeSingle() throw.
    .eq("period_kind", "week")
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
  // The conflict target must name all three columns of the unique index
  // phase 19 introduced. The old two-column constraint no longer exists, and
  // an ON CONFLICT that doesn't match any index fails at runtime.
  const period = periodFromStart("week", weekStart);
  const { error } = await supabase.from("weekly_reports").upsert(
    {
      client_id: clientId,
      week_start: period.start,
      period_kind: period.kind,
      period_end: period.end,
      report_html: text,
    },
    { onConflict: "client_id,week_start,period_kind" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/reports`);
}
