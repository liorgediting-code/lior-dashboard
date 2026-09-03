"use server";

import { revalidatePath } from "next/cache";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { syncInstagramInsights } from "@/lib/instagram/insights";

export type SyncInstagramResult =
  | { ok: true; dailyRows: number; mediaCount: number }
  | { ok: false; error: string };

/**
 * Runs the same sync as POST /api/cron/instagram-sync, from a button.
 *
 * That route is guarded by CRON_SECRET and nothing in this repo schedules
 * it (there is no vercel.json — see docs/PROJECT_STATUS.md), so until an
 * external scheduler is wired up this action is the only way to refresh
 * Instagram data without hand-crafting a curl. Being a server action it
 * needs no secret: it never crosses the network boundary as a public route.
 *
 * Returns a result object instead of throwing: Next.js redacts every thrown
 * Server Action error in production down to a generic "Server Components
 * render" digest message, so a thrown Error here is indistinguishable from
 * any other failure by the time the button sees it. Returning the reason
 * keeps it readable.
 */
export async function syncInstagramNow(): Promise<SyncInstagramResult> {
  try {
    assertAgencyAccess();

    const result = await syncInstagramInsights();
    // syncInstagramInsights RETURNS `{ synced: false, reason }` when Instagram
    // is unconfigured instead of throwing; without this check the button would
    // report a cheerful success having done nothing at all.
    if (!result.synced) return { ok: false, error: result.reason ?? "סנכרון אינסטגרם נכשל" };

    revalidatePath("/instagram");
    return { ok: true, dailyRows: result.dailyRows ?? 0, mediaCount: result.mediaCount ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "סנכרון אינסטגרם נכשל" };
  }
}
