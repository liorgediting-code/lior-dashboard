import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dashboard-lior/shared";

// There is no Supabase Auth session in this round (deferred, see
// lib/auth/get-current-actor.ts), so every server-side call uses the
// service-role key. Never import this file from a client component.
let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and run `supabase start` to get local values."
    );
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js patches global fetch() to cache requests indefinitely unless told
    // otherwise, and that cache persists across deployments. supabase-js never
    // sets a cache option, so every query here was at risk of serving a
    // deployment-stale response. Force no-store so admin reads are always live.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}
