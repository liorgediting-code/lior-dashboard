import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { CampaignStats } from "@/lib/metrics/campaign-stats";
import { formatPeriod, type ReportPeriod } from "./periods";

// Pure text assembly — no `server-only`, no Supabase — so the wording is
// unit-testable. The action that gathers the numbers is lib/actions/reports.ts.

export type ReportInput = {
  clientName: string;
  period: ReportPeriod;
  overall: CampaignStats;
  campaigns: { name: string; stats: CampaignStats }[];
  /** Leads created inside the period. */
  leadsCreated: number;
  /** Leads whose status moved to won inside the period. */
  dealsClosed: number;
  /** Sum of deal_value on those leads. */
  revenue: number;
  /** Free text the client wrote in their weekly questionnaire, if any. */
  clientFeedback?: string | null;
};

function heading(input: ReportInput): string {
  const kind = input.period.kind === "month" ? "דוח חודשי" : "דוח שבועי";
  return `${kind} · ${input.clientName} · ${formatPeriod(input.period)}`;
}

/**
 * The report the client actually reads. Plain text on purpose: it renders in
 * the portal, and it can be pasted straight into WhatsApp or an email without
 * carrying markup along.
 *
 * Campaigns with no spend in the period are left out — a paused campaign
 * listed at ₪0 reads as a failure rather than as "not running".
 */
export function buildReportText(input: ReportInput): string {
  const lines: string[] = [heading(input), ""];

  lines.push("📊 המספרים");
  lines.push(`השקעה בפרסום: ${formatCurrency(input.overall.spend)}`);
  lines.push(`לידים שהתקבלו: ${formatNumber(input.leadsCreated)}`);
  lines.push(`עלות לליד: ${formatCurrency(input.overall.cpl)}`);
  lines.push(`חשיפות: ${formatNumber(input.overall.impressions)} · קליקים: ${formatNumber(input.overall.clicks)} · CTR: ${formatPercent(input.overall.ctr)}`);
  lines.push("");

  lines.push("💰 תוצאות");
  lines.push(`עסקאות שנסגרו: ${formatNumber(input.dealsClosed)}`);
  lines.push(`הכנסה מהעסקאות: ${formatCurrency(input.revenue)}`);
  if (input.dealsClosed > 0) {
    lines.push(`עלות לעסקה: ${formatCurrency(input.overall.spend / input.dealsClosed)}`);
  }
  if (input.revenue > 0 && input.overall.spend > 0) {
    lines.push(`החזר על ההשקעה: ${formatNumber(input.revenue / input.overall.spend)}₪ על כל ₪1 פרסום`);
  }
  lines.push("");

  const activeCampaigns = input.campaigns.filter((campaign) => campaign.stats.spend > 0);
  if (activeCampaigns.length > 0) {
    lines.push("🎯 לפי קמפיין");
    for (const campaign of activeCampaigns) {
      lines.push(
        `• ${campaign.name}: ${formatCurrency(campaign.stats.spend)} · ${formatNumber(campaign.stats.leads)} לידים · CPL ${formatCurrency(campaign.stats.cpl)}`
      );
    }
    lines.push("");
  }

  if (input.clientFeedback?.trim()) {
    lines.push("🗣 מה שסיפרתם לנו");
    lines.push(input.clientFeedback.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
