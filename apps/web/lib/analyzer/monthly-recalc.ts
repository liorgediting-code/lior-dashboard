import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateMaxCpl } from "./calculate-max-cpl";
import {
  MIN_CLOSES_FOR_CPL_RECALC,
  MIN_CLIENTS_FOR_LEARNED_BENCHMARK,
  CPL_RECALC_WINDOW_DAYS,
} from "./thresholds";
import type { ClientCurrentMetrics } from "@dashboard-lior/shared";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getCurrentMetrics(clientId: string, since: string, until: string): Promise<ClientCurrentMetrics | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc("fn_client_current_metrics", {
    p_client_id: clientId,
    p_since: since,
    p_until: until,
  });
  if (error) throw new Error(error.message);
  return (data?.[0] as ClientCurrentMetrics | undefined) ?? null;
}

/**
 * Spec idea 1: recalculates a single client's max_cpl from real lead
 * closes instead of the initial default-table estimate, once there are
 * enough real closes to trust.
 */
export async function recalcClientMaxCpl(clientId: string, profitRatio: number) {
  const supabase = supabaseAdmin();
  const since = isoDaysAgo(CPL_RECALC_WINDOW_DAYS);
  const until = isoDaysAgo(0);

  const metrics = await getCurrentMetrics(clientId, since, until);
  if (!metrics?.closes || metrics.closes < MIN_CLOSES_FOR_CPL_RECALC || metrics.close_rate_pct == null) {
    return { clientId, updated: false, reason: "not enough real closes yet" };
  }

  const { data: wonLeads } = await supabase
    .from("leads")
    .select("deal_value")
    .eq("client_id", clientId)
    .eq("stage", "won")
    .gte("created_at", since);

  const values = (wonLeads ?? []).map((l) => l.deal_value as number | null).filter((v): v is number => v != null);
  if (values.length === 0) return { clientId, updated: false, reason: "no deal_value on won leads" };

  const avgDealValue = values.reduce((a, b) => a + b, 0) / values.length;
  const leadValue = avgDealValue * (metrics.close_rate_pct / 100);
  const maxCpl = calculateMaxCpl(leadValue, profitRatio);

  await supabase.from("clients").update({ max_cpl: maxCpl }).eq("id", clientId);
  await supabase.from("cpl_threshold_history").insert({ client_id: clientId, max_cpl: maxCpl, computed_from: "actual_closes" });

  return { clientId, updated: true, maxCpl };
}

/**
 * Spec idea 2: once enough clients of the same business_type have real
 * closes, the shared default table switches from the seeded estimate to a
 * learned average from actual agency data.
 */
export async function recalcBusinessTypeBenchmarks() {
  const supabase = supabaseAdmin();
  const since = isoDaysAgo(CPL_RECALC_WINDOW_DAYS);
  const until = isoDaysAgo(0);

  const { data: clients } = await supabase.from("clients").select("id, business_type");
  const closeRatesByType = new Map<string, number[]>();

  for (const client of clients ?? []) {
    const metrics = await getCurrentMetrics(client.id as string, since, until);
    if (metrics?.closes && metrics.closes >= MIN_CLOSES_FOR_CPL_RECALC && metrics.close_rate_pct != null) {
      const list = closeRatesByType.get(client.business_type as string) ?? [];
      list.push(metrics.close_rate_pct);
      closeRatesByType.set(client.business_type as string, list);
    }
  }

  const updated: string[] = [];
  for (const [businessType, rates] of closeRatesByType) {
    if (rates.length < MIN_CLIENTS_FOR_LEARNED_BENCHMARK) continue;
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    await supabase
      .from("business_type_benchmarks")
      .upsert(
        { business_type: businessType, close_rate_estimate: avg, sample_size: rates.length, source: "learned", updated_at: new Date().toISOString() },
        { onConflict: "business_type" }
      );
    updated.push(businessType);
  }

  return { updatedBusinessTypes: updated };
}

export async function recalcAllClientThresholds() {
  const supabase = supabaseAdmin();
  const { data: clients } = await supabase.from("clients").select("id, profit_ratio");

  const results = [];
  for (const client of clients ?? []) {
    results.push(await recalcClientMaxCpl(client.id as string, client.profit_ratio as number));
  }

  const benchmarks = await recalcBusinessTypeBenchmarks();
  return { clients: results, benchmarks };
}
