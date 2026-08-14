import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IgDailyMetrics, IgMedia } from "@dashboard-lior/shared";
import { IG_ACCOUNT_ID } from "./client";
import { isMissingSchemaError } from "@/lib/supabase/schema-state";

type Supabase = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

/**
 * Pages through ig_media rather than one unbounded select — Supabase caps
 * API responses at 1,000 rows by default, and a growing account would
 * silently lose posts off the bottom of the table otherwise.
 */
export async function fetchAllMedia(supabase: Supabase): Promise<IgMedia[]> {
  const rows: IgMedia[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ig_media")
      .select("*")
      .eq("ig_account_id", IG_ACCOUNT_ID)
      .order("posted_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    // Before the phase-20 migration is applied there is no table to read;
    // that is the page's empty state, not an error worth a 500.
    if (isMissingSchemaError(error)) return rows;
    if (error) throw new Error(error.message);

    const page = (data ?? []) as IgMedia[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchDailyMetrics(supabase: Supabase, since: string, until: string): Promise<IgDailyMetrics[]> {
  const { data, error } = await supabase
    .from("ig_daily_metrics")
    .select("*")
    .eq("ig_account_id", IG_ACCOUNT_ID)
    .gte("date", since)
    .lte("date", until)
    .order("date", { ascending: true });
  if (isMissingSchemaError(error)) return [];
  if (error) throw new Error(error.message);
  return (data ?? []) as IgDailyMetrics[];
}
