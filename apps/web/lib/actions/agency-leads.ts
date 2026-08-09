"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgencyLead, AgencyLeadStatus } from "@dashboard-lior/shared";

const AGENCY_LEAD_STATUSES: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal", "won", "lost"];

/** Statuses that end the pipeline — reaching one stamps `closed_at`. */
const CLOSED_STATUSES: AgencyLeadStatus[] = ["won", "lost"];

function parseStatus(value: FormDataEntryValue | null): AgencyLeadStatus {
  const raw = String(value ?? "");
  return (AGENCY_LEAD_STATUSES as string[]).includes(raw) ? (raw as AgencyLeadStatus) : "new";
}

/** Empty form fields arrive as "" — store them as NULL, not empty strings. */
function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createAgencyLeadFromForm(formData: FormData) {
  const name = nullable(formData.get("name"));
  if (!name) return;

  const status = parseStatus(formData.get("status"));
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("agency_leads").insert({
    name,
    business_name: nullable(formData.get("business_name")),
    phone: nullable(formData.get("phone")),
    email: nullable(formData.get("email")),
    source: nullable(formData.get("source")),
    status,
    deal_value: nullableNumber(formData.get("deal_value")),
    notes: nullable(formData.get("notes")),
    follow_up_at: nullable(formData.get("follow_up_at")),
    closed_at: CLOSED_STATUSES.includes(status) ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/agency-crm");
}

/**
 * Status drives `closed_at`: moving into won/lost stamps it (so "deals closed
 * this month" stays computable without a history table), moving back out of
 * them clears it. Mirrors the same rule the per-client CRM uses for `leads`.
 */
export async function updateAgencyLeadStatus(id: string, status: AgencyLeadStatus) {
  if (!(AGENCY_LEAD_STATUSES as string[]).includes(status)) return;

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("agency_leads").select("closed_at").eq("id", id).maybeSingle();

  const isClosing = CLOSED_STATUSES.includes(status);
  const closedAt = isClosing ? (existing?.closed_at ?? new Date().toISOString()) : null;

  const { error } = await supabase
    .from("agency_leads")
    .update({ status, closed_at: closedAt, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/agency-crm");
}

type EditableField = "name" | "business_name" | "phone" | "email" | "source" | "deal_value" | "notes" | "follow_up_at";

const NUMERIC_FIELDS: EditableField[] = ["deal_value"];

export async function updateAgencyLeadField(id: string, field: EditableField, value: string) {
  const trimmed = value.trim();
  const patch: Partial<AgencyLead> = { updated_at: new Date().toISOString() };

  if (NUMERIC_FIELDS.includes(field)) {
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && !Number.isFinite(parsed)) return;
    patch.deal_value = parsed;
  } else if (field === "name") {
    // name is NOT NULL in the schema — refuse to blank it rather than error.
    if (trimmed === "") return;
    patch.name = trimmed;
  } else {
    (patch as Record<string, string | null>)[field] = trimmed === "" ? null : trimmed;
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("agency_leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/agency-crm");
}

export async function deleteAgencyLead(id: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("agency_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/agency-crm");
}
