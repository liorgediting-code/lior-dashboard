import { createClient } from "@supabase/supabase-js";
import type { Database } from "@dashboard-lior/shared";

/**
 * Same local Supabase instance the web app talks to, using the
 * service-role key — this package is read-only by construction (every
 * tool only ever calls .select()), not by RLS, since RLS is disabled
 * project-wide until Supabase Auth ships.
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Run `supabase start` locally and export its output."
    );
  }

  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
