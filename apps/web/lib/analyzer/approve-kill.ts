import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentActor } from "@/lib/auth/get-current-actor";

/**
 * The only write this system ever makes for a kill: recording a manual,
 * human approval. This function deliberately never calls the Meta API to
 * pause or delete anything — that stays a human action in Meta Ads Manager
 * per the spec's explicit safety requirement.
 */
export async function approveKillQueueItem(itemId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("kill_queue_items")
    .update({
      status: "approved",
      approved_by: getCurrentActor(),
      approved_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function dismissKillQueueItem(itemId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("kill_queue_items")
    .update({ status: "dismissed" })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}
