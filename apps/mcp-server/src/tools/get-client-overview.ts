import { z } from "zod";
import { getSupabaseClient } from "../supabase-client.js";

export const getClientOverviewSchema = { client_id: z.string().uuid() };

export async function getClientOverview({ client_id }: { client_id: string }) {
  const supabase = getSupabaseClient();

  const [{ data: client, error }, { data: baseline }, { data: gates }, { data: metrics }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", client_id).single(),
    supabase.from("baseline_snapshots").select("*").eq("client_id", client_id).maybeSingle(),
    supabase.from("sop_gates").select("*").eq("client_id", client_id).order("gate_number"),
    supabase.rpc("fn_client_current_metrics", { p_client_id: client_id }),
  ]);

  if (error || !client) throw new Error(`Client ${client_id} not found`);

  return {
    client,
    baseline_snapshot: baseline ?? null,
    sop_gates: gates ?? [],
    current_metrics_last_30_days: metrics?.[0] ?? null,
  };
}
