"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchCampaignStats, fetchCampaignsForClient } from "@/lib/metrics/fetch-stats";
import { buildReportText } from "@/lib/reports/build-report";
import { periodFromStart } from "@/lib/reports/periods";
import { resolveTemplateForClient } from "@/lib/crm/questionnaire";
import type { Lead, QuestionnaireResponse, ReportPeriodKind } from "@dashboard-lior/shared";

function revalidateReports(clientId: string) {
  revalidatePath(`/clients/${clientId}/reports`);
  revalidatePath(`/client/${clientId}/reports`);
}

function parseKind(value: FormDataEntryValue | null): ReportPeriodKind {
  return String(value ?? "") === "month" ? "month" : "week";
}

/**
 * The client's own words from the weekly questionnaire, folded into the
 * report so it reads as a conversation rather than a printout.
 *
 * Only free-text answers are used — the numeric ones (deals closed, revenue)
 * are already reported from the CRM, and quoting a client's guess next to the
 * measured figure invites an argument about which is right.
 */
async function fetchClientFeedback(clientId: string, periodStart: string, periodEnd: string): Promise<string | null> {
  const supabase = supabaseAdmin();
  const [template, { data: responseRows }] = await Promise.all([
    resolveTemplateForClient(supabase, clientId),
    supabase
      .from("questionnaire_responses")
      .select("*")
      .eq("client_id", clientId)
      // week_start is itself a Sunday, so this range picks up exactly one
      // response for a weekly report and every week of a monthly one.
      .gte("week_start", periodStart)
      .lte("week_start", periodEnd)
      .order("week_start", { ascending: true }),
  ]);

  const responses = (responseRows ?? []) as QuestionnaireResponse[];
  if (!template || responses.length === 0) return null;

  const textQuestions = template.questions.filter((question) => question.type === "text" || question.type === "textarea");

  const lines: string[] = [];
  for (const response of responses) {
    for (const question of textQuestions) {
      const answer = response.answers[question.id];
      if (typeof answer === "string" && answer.trim()) lines.push(`${question.label} ${answer.trim()}`);
    }
  }

  return lines.length ? lines.join("\n") : null;
}

/**
 * Builds (or rebuilds) the report for one period and stores it as a draft.
 *
 * Regenerating overwrites the text: the numbers are the point, and a stale
 * draft that disagrees with the dashboard is worse than a lost edit. Once a
 * report has been sent it is left alone — see the guard below.
 */
export async function generateReport(clientId: string, kind: ReportPeriodKind, startIso: string) {
  const period = periodFromStart(kind, startIso);
  const supabase = supabaseAdmin();

  const [{ data: client }, campaigns] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    fetchCampaignsForClient(supabase, clientId),
  ]);
  if (!client) throw new Error("לקוח לא נמצא");

  // `created_at`/`closed_at` are timestamps while the period is a pair of
  // bare dates, so the upper bound is the START of the next day rather than
  // `<= end` — which would drop everything that happened after midnight on
  // the last day of the period.
  const periodStartTs = `${period.start}T00:00:00Z`;
  const dayAfterEnd = new Date(`${period.end}T00:00:00Z`);
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
  const periodEndTs = dayAfterEnd.toISOString();

  const [stats, { count: leadsCreated }, { data: closedRows }, clientFeedback] = await Promise.all([
    fetchCampaignStats(
      supabase,
      campaigns.map((campaign) => campaign.id),
      { since: period.start, until: period.end }
    ),
    supabase
      .from("leads")
      // Counted server-side rather than by fetching rows: a busy month can
      // exceed the API's row cap and would silently under-report.
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", periodStartTs)
      .lt("created_at", periodEndTs),
    supabase
      .from("leads")
      .select("deal_value")
      .eq("client_id", clientId)
      .gte("closed_at", periodStartTs)
      .lt("closed_at", periodEndTs),
    fetchClientFeedback(clientId, period.start, period.end),
  ]);

  const closed = (closedRows ?? []) as Pick<Lead, "deal_value">[];
  const revenue = closed.reduce((sum, lead) => sum + (Number(lead.deal_value) || 0), 0);

  const reportText = buildReportText({
    clientName: client.name as string,
    period,
    overall: stats.overall,
    campaigns: campaigns.map((campaign) => ({ name: campaign.name, stats: stats.byCampaign(campaign.id) })),
    leadsCreated: leadsCreated ?? 0,
    dealsClosed: closed.length,
    revenue,
    clientFeedback,
  });

  // Select-then-write rather than `.upsert()`: the conflict target is the
  // three-column index added in phase 19, and this also lets a sent report
  // be protected instead of silently rewritten under the client's feet.
  const { data: existing } = await supabase
    .from("weekly_reports")
    .select("id, sent_at")
    .eq("client_id", clientId)
    .eq("week_start", period.start)
    .eq("period_kind", period.kind)
    .maybeSingle();

  if (existing?.sent_at) {
    throw new Error("הדוח כבר נשלח ללקוח. בטל שליחה לפני יצירה מחדש.");
  }

  const payload = {
    client_id: clientId,
    week_start: period.start,
    period_kind: period.kind,
    period_end: period.end,
    report_html: reportText,
    leads_closed_count: closed.length,
  };

  const { error } = existing
    ? await supabase.from("weekly_reports").update(payload).eq("id", existing.id as string)
    : await supabase.from("weekly_reports").insert(payload);
  if (error) throw new Error(error.message);

  revalidateReports(clientId);
}

export async function generateReportFromForm(clientId: string, formData: FormData) {
  await generateReport(clientId, parseKind(formData.get("period_kind")), String(formData.get("period_start") ?? ""));
}

export async function saveReportTextFromForm(reportId: string, clientId: string, formData: FormData) {
  const text = String(formData.get("report_text") ?? "");
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("weekly_reports").update({ report_html: text }).eq("id", reportId).eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidateReports(clientId);
}

/**
 * "Sending" is publishing: `sent_at` is what makes the report visible in the
 * client's portal (and what makes the דוחות tab appear there at all). There
 * is no email/WhatsApp delivery wired up — the report text is written to be
 * pasteable if you'd rather send it by hand.
 */
export async function setReportSent(reportId: string, clientId: string, sent: boolean) {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("weekly_reports")
    .update({ sent_at: sent ? new Date().toISOString() : null })
    .eq("id", reportId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidateReports(clientId);
}

export async function deleteReport(reportId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("weekly_reports").delete().eq("id", reportId).eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidateReports(clientId);
}
