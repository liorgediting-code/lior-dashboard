"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentActor } from "@/lib/auth/get-current-actor";
import { getStageDefinition, nextStage } from "./stage-machine";

const MAGIC_LINK_TTL_HOURS = 72;

/**
 * `actor` is a parameter, not a `getCurrentActor()` call, for the same reason
 * approveGate takes one: some advances are triggered by the CLIENT, not the
 * agency (filling the stage-0 intake form via its public token), and those
 * have no agency session to read an actor from. Defaults to the agency for
 * every internal call site.
 */
export async function advanceStage(clientId: string, actor: string = getCurrentActor()) {
  const supabase = supabaseAdmin();
  const { data: client, error } = await supabase
    .from("clients")
    .select("sop_stage")
    .eq("id", clientId)
    .single();
  if (error || !client) throw new Error("Client not found");

  const from = client.sop_stage as number;
  const to = nextStage(from);
  if (to === null) throw new Error("Client is already at the final SOP stage");

  const def = getStageDefinition(to);

  await supabase.from("clients").update({ sop_stage: to, sop_stage_updated_at: new Date().toISOString() }).eq("id", clientId);
  await supabase.from("sop_gate_events").insert({
    client_id: clientId,
    event_type: "stage_advanced",
    from_stage: from,
    to_stage: to,
    actor,
  });

  // ensure a pending gate row exists once we enter a gated stage
  if (def.gateNumber) {
    const { data: existingGate } = await supabase
      .from("sop_gates")
      .select("id")
      .eq("client_id", clientId)
      .eq("gate_number", def.gateNumber)
      .maybeSingle();
    if (!existingGate) {
      await supabase.from("sop_gates").insert({ client_id: clientId, gate_number: def.gateNumber, status: "pending" });
    }
  }

  revalidatePath(`/clients/${clientId}`);
}

export async function requestGateApproval(clientId: string, gateNumber: 1 | 2 | 3 | 4) {
  const supabase = supabaseAdmin();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await supabase.from("magic_links").insert({ token, client_id: clientId, gate_number: gateNumber, expires_at: expiresAt });
  await supabase.from("sop_gate_events").insert({
    client_id: clientId,
    event_type: "magic_link_sent",
    gate_number: gateNumber,
    actor: getCurrentActor(),
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return { token, url: `${baseUrl}/approve/${token}` };
}

/**
 * The single funnel every gate approval goes through, whether triggered by
 * the agency internally or by a client via magic link — keeps the
 * dispute-proof audit trail in sop_gate_events consistent either way.
 */
export async function approveGate(clientId: string, gateNumber: 1 | 2 | 3 | 4, actor: string) {
  const supabase = supabaseAdmin();

  if (gateNumber === 1) {
    const { data: client } = await supabase
      .from("clients")
      .select("strategy_call_recording_url, strategy_call_transcript_url")
      .eq("id", clientId)
      .single();
    if (!client?.strategy_call_recording_url || !client?.strategy_call_transcript_url) {
      throw new Error("Gate 1 requires the strategy call recording + transcript to be uploaded first");
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("sop_gates")
    .upsert(
      { client_id: clientId, gate_number: gateNumber, status: "approved", approved_at: now, approved_by: actor },
      { onConflict: "client_id,gate_number" }
    );

  await supabase.from("sop_gate_events").insert({
    client_id: clientId,
    event_type: "gate_approved",
    gate_number: gateNumber,
    actor,
    metadata: { approved_at: now },
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function advanceStageFromForm(clientId: string) {
  await advanceStage(clientId);
  redirect(`/clients/${clientId}`);
}

export async function approveGateFromForm(clientId: string, gateNumber: 1 | 2 | 3 | 4) {
  await approveGate(clientId, gateNumber, getCurrentActor());
  redirect(`/clients/${clientId}`);
}

export async function requestGateApprovalFromForm(clientId: string, gateNumber: 1 | 2 | 3 | 4) {
  const { url } = await requestGateApproval(clientId, gateNumber);
  redirect(`/clients/${clientId}?magicLink=${encodeURIComponent(url)}&gate=${gateNumber}`);
}

export async function approveGateViaMagicLink(token: string) {
  const supabase = supabaseAdmin();
  const { data: link, error } = await supabase.from("magic_links").select("*").eq("token", token).single();
  if (error || !link) throw new Error("קישור לא תקין");
  if (link.used_at) throw new Error("הקישור כבר נוצל");
  if (new Date(link.expires_at as string) < new Date()) throw new Error("הקישור פג תוקף");

  await approveGate(link.client_id as string, link.gate_number as 1 | 2 | 3 | 4, "client_magic_link");
  await supabase.from("magic_links").update({ used_at: new Date().toISOString() }).eq("token", token);

  return { clientId: link.client_id as string, gateNumber: link.gate_number as number };
}
