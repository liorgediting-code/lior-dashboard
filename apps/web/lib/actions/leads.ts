"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Lead, LeadStatusKind } from "@dashboard-lior/shared";
import { computeStatusChangePatch } from "@/lib/crm/status-rules";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLead(input: {
  client_id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source_ad_id?: string | null;
  status_id?: string | null;
}) {
  assertCrmAccess(input.client_id);
  const supabase = supabaseAdmin();

  let statusId = input.status_id ?? null;
  if (!statusId) {
    const { data: defaultStatus } = await supabase
      .from("lead_statuses")
      .select("id")
      .eq("client_id", input.client_id)
      .eq("is_default", true)
      .maybeSingle();
    statusId = (defaultStatus?.id as string | undefined) ?? null;
  }
  if (!statusId) throw new Error("ללקוח הזה אין סטטוס ברירת מחדל מוגדר");

  const { data, error } = await supabase
    .from("leads")
    .insert({
      client_id: input.client_id,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source_ad_id: input.source_ad_id ?? null,
      status_id: statusId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidateCrm(input.client_id);
  return data;
}

export async function createLeadFromForm(clientId: string, formData: FormData) {
  await createLead({
    client_id: clientId,
    name: String(formData.get("name") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
  });
}

export async function updateLeadField(leadId: string, clientId: string, field: string, value: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();

  if (field.startsWith("custom:")) {
    const columnId = field.slice("custom:".length);
    const [{ data: lead }, { data: column }] = await Promise.all([
      supabase.from("leads").select("custom_fields").eq("id", leadId).single(),
      supabase.from("lead_columns").select("type").eq("id", columnId).single(),
    ]);
    const currentFields = (lead?.custom_fields as Record<string, string | number>) ?? {};
    const parsedValue: string | number = column?.type === "number" ? Number(value) || 0 : value;
    const { error } = await supabase
      .from("leads")
      .update({ custom_fields: { ...currentFields, [columnId]: parsedValue } })
      .eq("id", leadId)
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
  } else if (field === "name" || field === "phone" || field === "email") {
    const { error } = await supabase
      .from("leads")
      .update({ [field]: value || null } as Partial<Lead>)
      .eq("id", leadId)
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
  } else if (field === "deal_value") {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const dealValue = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const { error } = await supabase
      .from("leads")
      .update({ deal_value: dealValue })
      .eq("id", leadId)
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
  } else {
    throw new Error(`שדה לא ידוע: ${field}`);
  }

  revalidateCrm(clientId);
}

export async function updateLeadStatus(leadId: string, clientId: string, statusId: string, dealValue?: number | null) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { data: status } = await supabase
    .from("lead_statuses")
    .select("kind")
    .eq("id", statusId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!status) throw new Error("סטטוס לא נמצא");

  const patch = computeStatusChangePatch(status.kind as LeadStatusKind, dealValue);
  const { error } = await supabase
    .from("leads")
    .update({ status_id: statusId, ...patch })
    .eq("id", leadId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLead(leadId: string, clientId: string) {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("leads").delete().eq("id", leadId).eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}
