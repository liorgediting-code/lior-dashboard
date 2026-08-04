import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateLeadValue } from "./calculate-lead-value";
import { calculateMaxCpl } from "./calculate-max-cpl";
import { classifyAd, classifyAdSetZeroLeads, type AnalyzerVerdict } from "./classify-ad";

export interface AnalyzerReportRow {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  spend: number;
  leads: number;
  cpl: number | null;
  verdict: AnalyzerVerdict;
  reason: string;
  recommendedAction: string;
}

export interface AnalyzerReport {
  clientId: string;
  maxCpl: number;
  maxCplRoute: "A" | "B" | "C" | "existing";
  since: string;
  until: string;
  rows: AnalyzerReportRow[];
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Ensures the client has a max_cpl. If it's still null (never computed),
 * derives it once from the deterministic lead-value formula and persists it
 * (clients.max_cpl + a cpl_threshold_history row with computed_from =
 * 'default_table'). The monthly recalculation job (phase 3) later overwrites
 * this with computed_from = 'actual_closes' once there's real close data.
 */
async function ensureMaxCpl(clientId: string) {
  const supabase = supabaseAdmin();
  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (error || !client) throw new Error(`Client ${clientId} not found`);

  if (client.max_cpl != null) {
    return { maxCpl: client.max_cpl as number, route: "existing" as const };
  }

  let estimatedCloseRatePct: number | null = null;
  if (client.deal_price_avg == null || client.close_rate_pct == null) {
    const { data: benchmark } = await supabase
      .from("business_type_benchmarks")
      .select("close_rate_estimate")
      .eq("business_type", client.business_type)
      .maybeSingle();
    estimatedCloseRatePct = (benchmark?.close_rate_estimate as number | undefined) ?? null;
  }

  const leadValue = calculateLeadValue({
    dealPriceAvg: client.deal_price_avg as number | null,
    closeRatePct: client.close_rate_pct as number | null,
    monthlyRevenue: client.monthly_revenue as number | null,
    dealsPerMonth: client.deals_per_month as number | null,
    estimatedCloseRatePct,
    priceRangeLow: client.price_range_low as number | null,
  });

  if (!leadValue) {
    throw new Error(
      `Client ${clientId} doesn't have enough data for any lead-value route (A/B/C) — fill in the client profile first.`
    );
  }

  const maxCpl = calculateMaxCpl(leadValue.value, client.profit_ratio as number);

  await supabase.from("clients").update({ max_cpl: maxCpl }).eq("id", clientId);
  await supabase.from("cpl_threshold_history").insert({
    client_id: clientId,
    max_cpl: maxCpl,
    computed_from: "default_table",
  });

  return { maxCpl, route: leadValue.route };
}

/**
 * Impure orchestrator: turns live ad_metrics_daily rows into the "see
 * report" table. Never mutates the kill queue — see sync-kill-queue.ts for
 * that, kept deliberately separate so viewing a report has no side effects.
 */
export async function runAnalyzer(
  clientId: string,
  opts?: { since?: string; until?: string }
): Promise<AnalyzerReport> {
  const supabase = supabaseAdmin();
  const until = opts?.until ?? isoDate(new Date());
  const since = opts?.since ?? isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const { maxCpl, route } = await ensureMaxCpl(clientId);

  const { data: campaigns } = await supabase.from("campaigns").select("id").eq("client_id", clientId);
  const campaignIds = (campaigns ?? []).map((c) => c.id as string);
  if (campaignIds.length === 0) {
    return { clientId, maxCpl, maxCplRoute: route, since, until, rows: [] };
  }

  const { data: adsets } = await supabase
    .from("adsets")
    .select("id, name")
    .in("campaign_id", campaignIds);
  const adsetIds = (adsets ?? []).map((a) => a.id as string);
  if (adsetIds.length === 0) {
    return { clientId, maxCpl, maxCplRoute: route, since, until, rows: [] };
  }
  const adsetNameById = new Map((adsets ?? []).map((a) => [a.id as string, a.name as string]));

  const { data: ads } = await supabase.from("ads").select("id, name, adset_id").in("adset_id", adsetIds);
  const adRows = ads ?? [];
  const adIds = adRows.map((a) => a.id as string);
  if (adIds.length === 0) {
    return { clientId, maxCpl, maxCplRoute: route, since, until, rows: [] };
  }

  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select("ad_id, spend, leads")
    .in("ad_id", adIds)
    .gte("date", since)
    .lte("date", until);

  const totalsByAd = new Map<string, { spend: number; leads: number }>();
  for (const row of metrics ?? []) {
    const adId = row.ad_id as string;
    const cur = totalsByAd.get(adId) ?? { spend: 0, leads: 0 };
    cur.spend += Number(row.spend);
    cur.leads += Number(row.leads);
    totalsByAd.set(adId, cur);
  }

  const totalsByAdset = new Map<string, { spend: number; leads: number }>();
  for (const ad of adRows) {
    const totals = totalsByAd.get(ad.id as string) ?? { spend: 0, leads: 0 };
    const cur = totalsByAdset.get(ad.adset_id as string) ?? { spend: 0, leads: 0 };
    cur.spend += totals.spend;
    cur.leads += totals.leads;
    totalsByAdset.set(ad.adset_id as string, cur);
  }

  const rows: AnalyzerReportRow[] = [];
  for (const ad of adRows) {
    const adsetId = ad.adset_id as string;
    const totals = totalsByAd.get(ad.id as string) ?? { spend: 0, leads: 0 };
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;

    const adsetTotals = totalsByAdset.get(adsetId) ?? { spend: 0, leads: 0 };
    const adsetKill = classifyAdSetZeroLeads({
      totalSpend: adsetTotals.spend,
      totalLeads: adsetTotals.leads,
    });

    const classification =
      adsetKill ?? classifyAd({ spend: totals.spend, leads: totals.leads, cpl, maxCpl });

    rows.push({
      adId: ad.id as string,
      adName: ad.name as string,
      adsetId,
      adsetName: adsetNameById.get(adsetId) ?? "",
      spend: totals.spend,
      leads: totals.leads,
      cpl,
      verdict: classification.verdict,
      reason: classification.reason,
      recommendedAction: classification.recommendedAction,
    });
  }

  return { clientId, maxCpl, maxCplRoute: route, since, until, rows };
}
