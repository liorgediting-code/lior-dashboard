"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";

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
