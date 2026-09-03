"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { THRESHOLD_KEYS } from "@/lib/diagnostics/thresholds";
import type { ConversionGoal } from "@dashboard-lior/shared";

/**
 * Empty means "inherit", not "zero".
 *
 * The distinction is the whole point of the nullable threshold columns: a
 * cleared CTR field must fall back to the default, and writing 0 there
 * instead would make every campaign pass the CTR gate forever while looking
 * like a deliberate setting.
 */
function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export type SaveThresholdsResult = { ok: true } | { ok: false; error: string };

/**
 * Saves one threshold row: the global one (`clientId` empty) or a client's.
 *
 * Percent-shaped fields arrive from the form as percentages (a `14` meaning
 * 14%) because typing 0.14 into a box labelled "Hook Rate" is a reliable way
 * to enter the wrong number by two orders of magnitude. The conversion to
 * the engine's fractions happens here, in one place.
 */
const PERCENT_FIELDS = new Set(["hook_rate", "hold_rate", "ctr_link_click", "landing_page_conversion_rate"]);

export async function saveDiagnosticThresholds(formData: FormData): Promise<SaveThresholdsResult> {
  try {
    assertAgencyAccess();

    const clientIdRaw = String(formData.get("client_id") ?? "").trim();
    const clientId = clientIdRaw === "" ? null : clientIdRaw;

    const patch: Record<string, number | null> = {};
    for (const key of THRESHOLD_KEYS) {
      const value = parseOptionalNumber(formData.get(key));
      patch[key] = value !== null && PERCENT_FIELDS.has(key) ? value / 100 : value;
    }

    const supabase = supabaseAdmin();
    const { data: existing } = clientId
      ? await supabase.from("diagnostic_thresholds").select("id").eq("client_id", clientId).maybeSingle()
      : await supabase.from("diagnostic_thresholds").select("id").is("client_id", null).maybeSingle();

    // Upsert by hand rather than with onConflict: the uniqueness of the
    // global row is enforced by a PARTIAL index on `client_id is null`, and
    // postgrest's upsert cannot target a partial index.
    const { error } = existing
      ? await supabase
          .from("diagnostic_thresholds")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id as string)
      : await supabase.from("diagnostic_thresholds").insert({ ...patch, client_id: clientId });
    if (error) throw new Error(error.message);

    revalidatePath("/ad-analysis");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "שמירת הספים נכשלה" };
  }
}

export type SaveCampaignGoalResult = { ok: true } | { ok: false; error: string };

/**
 * The per-campaign economics: what a conversion may cost, and which action
 * counts as one. Without a target CPA the funnel's bottom gate stays silent
 * — there is no honest way to call a cost "too high" against a number nobody
 * has supplied.
 */
export async function saveCampaignGoal(campaignId: string, targetCpa: number | null, conversionGoal: ConversionGoal): Promise<SaveCampaignGoalResult> {
  try {
    assertAgencyAccess();

    const supabase = supabaseAdmin();
    const { error } = await supabase.from("campaigns").update({ target_cpa: targetCpa, conversion_goal: conversionGoal }).eq("id", campaignId);
    if (error) throw new Error(error.message);

    revalidatePath("/ad-analysis");
    revalidatePath(`/ad-analysis/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "שמירת היעד נכשלה" };
  }
}
