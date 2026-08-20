"use server";

import { revalidatePath } from "next/cache";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { syncInstagramInsights } from "@/lib/instagram/insights";

/**
 * Runs the same sync as POST /api/cron/instagram-sync, from a button.
 *
 * That route is guarded by CRON_SECRET and nothing in this repo schedules
 * it (there is no vercel.json — see docs/PROJECT_STATUS.md), so until an
 * external scheduler is wired up this action is the only way to refresh
 * Instagram data without hand-crafting a curl. Being a server action it
 * needs no secret: it never crosses the network boundary as a public route.
 */
export async function syncInstagramNow(): Promise<{ dailyRows: number; mediaCount: number }> {
  assertAgencyAccess();

  const result = await syncInstagramInsights();
  // syncInstagramInsights RETURNS `{ synced: false, reason }` when Instagram
  // is unconfigured instead of throwing; without this check the button would
  // report a cheerful success having done nothing at all.
  if (!result.synced) throw new Error(result.reason ?? "סנכרון אינסטגרם נכשל");

  revalidatePath("/instagram");
  return { dailyRows: result.dailyRows ?? 0, mediaCount: result.mediaCount ?? 0 };
}
