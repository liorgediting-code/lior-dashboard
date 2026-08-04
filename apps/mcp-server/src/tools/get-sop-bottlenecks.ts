import { getSupabaseClient } from "../supabase-client.js";

/** Backed by the sop_bottlenecks view — same source the dashboard's
 * bottleneck widget reads, so this tool and the UI never disagree. */
export async function getSopBottlenecks() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("sop_bottlenecks").select("*").order("days_stuck", { ascending: false });
  if (error) throw new Error(error.message);
  return { bottlenecks: data ?? [] };
}
