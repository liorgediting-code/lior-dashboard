"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DriveLink, FunnelStage, FunnelStatus } from "@dashboard-lior/shared";

const STAGES: FunnelStage[] = ["TOFU", "MOFU", "BOFU"];
const STATUSES: FunnelStatus[] = ["active", "paused", "archived"];

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function parseStage(value: FormDataEntryValue | null): FunnelStage | null {
  const raw = String(value ?? "");
  return (STAGES as string[]).includes(raw) ? (raw as FunnelStage) : null;
}

function parseStatus(value: FormDataEntryValue | null): FunnelStatus {
  const raw = String(value ?? "");
  return (STATUSES as string[]).includes(raw) ? (raw as FunnelStatus) : "active";
}

/**
 * The DriveLinksEditor posts its rows as a JSON string in a hidden input.
 * A malformed/absent value falls back to an empty list rather than throwing —
 * the column is NOT NULL with a '[]' default.
 */
function parseDriveLinks(value: FormDataEntryValue | null): DriveLink[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is DriveLink => row != null && typeof row === "object" && "label" in row && "url" in row)
      .map((row) => ({ label: String(row.label), url: String(row.url) }));
  } catch {
    return [];
  }
}

/** Checkbox group in the funnel form — one `campaign_ids` entry per checked box. */
function parseCampaignIds(formData: FormData): string[] {
  return formData.getAll("campaign_ids").map(String).filter((id) => id !== "");
}

async function replaceFunnelCampaigns(funnelId: string, campaignIds: string[]) {
  const supabase = supabaseAdmin();
  // Delete-then-insert rather than diffing: the join table has no extra
  // payload, so a full replace is simpler and equally correct.
  const { error: deleteError } = await supabase.from("funnel_campaigns").delete().eq("funnel_id", funnelId);
  if (deleteError) throw new Error(deleteError.message);

  if (campaignIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("funnel_campaigns")
    .insert(campaignIds.map((campaign_id) => ({ funnel_id: funnelId, campaign_id })));
  if (insertError) throw new Error(insertError.message);
}

export async function createFunnelFromForm(formData: FormData) {
  const name = nullable(formData.get("name"));
  if (!name) return;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("funnels")
    .insert({
      name,
      stage: parseStage(formData.get("stage")),
      status: parseStatus(formData.get("status")),
      client_id: nullable(formData.get("client_id")),
      description: nullable(formData.get("description")),
      drive_links: parseDriveLinks(formData.get("drive_links")),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await replaceFunnelCampaigns(data.id as string, parseCampaignIds(formData));

  revalidatePath("/funnels");
}

export async function updateFunnelFromForm(funnelId: string, formData: FormData) {
  const name = nullable(formData.get("name"));
  if (!name) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("funnels")
    .update({
      name,
      stage: parseStage(formData.get("stage")),
      status: parseStatus(formData.get("status")),
      client_id: nullable(formData.get("client_id")),
      description: nullable(formData.get("description")),
      drive_links: parseDriveLinks(formData.get("drive_links")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", funnelId);
  if (error) throw new Error(error.message);

  await replaceFunnelCampaigns(funnelId, parseCampaignIds(formData));

  revalidatePath("/funnels");
  revalidatePath(`/funnels/${funnelId}`);
}

export async function deleteFunnel(funnelId: string) {
  const supabase = supabaseAdmin();
  // funnel_campaigns cascades; notes.funnel_id is ON DELETE SET NULL, so
  // notes about this funnel survive as unattached notes.
  const { error } = await supabase.from("funnels").delete().eq("id", funnelId);
  if (error) throw new Error(error.message);

  revalidatePath("/funnels");
}
