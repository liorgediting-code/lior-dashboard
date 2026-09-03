"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { syncAllClients } from "@/lib/meta/sync";

export type SyncCampaignsResult =
  | { ok: true; synced: number; clients: number; notes: string[] }
  | { ok: false; error: string };

/**
 * The analysis window is 30 days, so a manual sync pulls 30 — the daily cron
 * keeps its 3-day lookback (cheap, and enough to catch Meta's late
 * attribution restatements). Pressing the button on a fresh database with a
 * 3-day pull would fill /ad-analysis with campaigns that every rule reports
 * as `insufficient_data`.
 */
const MANUAL_SYNC_LOOKBACK_DAYS = 30;

/**
 * Runs the same per-client Meta ad sync as POST /api/cron/daily-ad-sync, from
 * a button on /campaigns.
 *
 * Like the Instagram cron, nothing in this repo schedules daily-ad-sync (no
 * vercel.json), so this is the only way to pull fresh campaign data without
 * hand-crafting a curl against the CRON_SECRET-guarded route.
 *
 * Returns a result object instead of throwing: Next.js redacts every thrown
 * Server Action error in production down to a generic digest message, which
 * makes real failures (missing Meta token, bad ad account id) impossible to
 * diagnose from the button alone.
 */
export async function syncAllCampaignsNow(): Promise<SyncCampaignsResult> {
  try {
    assertAgencyAccess();

    const results = await syncAllClients(MANUAL_SYNC_LOOKBACK_DAYS);
    const synced = results.reduce((sum, r) => sum + r.synced, 0);

    // Per-client outcomes, named. "0 synced" with no explanation is the most
    // common and least actionable thing this button can say: it means a
    // missing ad account id on one client and a revoked token on another,
    // and the operator cannot tell which without being told.
    const notes = results
      .filter((result) => result.error || result.skipped)
      .map((result) => `${result.clientName}: ${result.error ?? result.skipped}`);

    revalidatePath("/campaigns");
    revalidatePath("/ad-analysis");
    return { ok: true, synced, clients: results.length, notes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "סנכרון קמפיינים נכשל" };
  }
}

/** Which CRM a campaign's dashboard is pinned to. */
export type CrmSurface = "agency" | "client";

/**
 * Pins or unpins one campaign's dashboard on one CRM.
 *
 * Agency-only: pinning to `client` publishes spend and CPL into that
 * client's portal, so a logged-in client must not be able to flip it for
 * themselves — nor to un-hide a campaign we chose not to show them.
 */
export async function setCampaignCrmVisibility(campaignId: string, surface: CrmSurface, visible: boolean): Promise<void> {
  assertAgencyAccess();

  const supabase = supabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("client_id").eq("id", campaignId).maybeSingle();
  if (!campaign) throw new Error("הקמפיין לא נמצא");

  // Spelled out per surface rather than with a computed key: a computed
  // property name widens the object to a string index signature, which the
  // generated Update type rejects.
  const patch = surface === "agency" ? { show_in_agency_crm: visible } : { show_in_client_crm: visible };
  const { error } = await supabase.from("campaigns").update(patch).eq("id", campaignId);
  if (error) throw new Error(error.message);

  const clientId = campaign.client_id as string;
  revalidatePath("/campaigns");
  revalidatePath("/agency-crm");
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}
