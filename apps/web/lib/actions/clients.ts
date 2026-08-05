"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dispatchWebhook } from "@/lib/notifications/dispatch-webhook";
import type { DriveLink } from "@dashboard-lior/shared";

export interface CreateClientInput {
  name: string;
  business_type: string;
  contact_info?: Record<string, unknown>;
  deal_price_avg?: number | null;
  close_rate_pct?: number | null;
  monthly_revenue?: number | null;
  deals_per_month?: number | null;
  price_range_low?: number | null;
  price_range_high?: number | null;
  profit_ratio?: number;
  drive_links?: DriveLink[];
  // Feature A: captured once at onboarding, immutable afterwards.
  baseline?: {
    leads_per_month?: number | null;
    avg_cost_per_lead?: number | null;
    revenue?: number | null;
    close_rate_pct?: number | null;
    product_price?: number | null;
  };
}

export async function createClient(input: CreateClientInput) {
  const supabase = supabaseAdmin();

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      business_type: input.business_type,
      contact_info: input.contact_info ?? {},
      deal_price_avg: input.deal_price_avg ?? null,
      close_rate_pct: input.close_rate_pct ?? null,
      monthly_revenue: input.monthly_revenue ?? null,
      deals_per_month: input.deals_per_month ?? null,
      price_range_low: input.price_range_low ?? null,
      price_range_high: input.price_range_high ?? null,
      profit_ratio: input.profit_ratio ?? 5,
      drive_links: input.drive_links ?? [],
    })
    .select()
    .single();

  if (error || !client) throw new Error(error?.message ?? "Failed to create client");

  await supabase.from("baseline_snapshots").insert({
    client_id: client.id as string,
    leads_per_month: input.baseline?.leads_per_month ?? null,
    avg_cost_per_lead: input.baseline?.avg_cost_per_lead ?? null,
    revenue: input.baseline?.revenue ?? null,
    close_rate_pct: input.baseline?.close_rate_pct ?? null,
    product_price: input.baseline?.product_price ?? null,
  });

  await supabase.from("sop_gate_events").insert({
    client_id: client.id as string,
    event_type: "client_created",
    to_stage: 0,
    actor: "agency_owner",
  });

  // Must not fail silently: a client with zero statuses can never receive a
  // lead (no default status) and there's no UI path to recreate the required
  // won/lost pair.
  const { error: statusError } = await supabase.from("lead_statuses").insert([
    { client_id: client.id as string, label: "חדש", kind: "open", sort_order: 0, is_default: true },
    { client_id: client.id as string, label: "בקשר", kind: "open", sort_order: 1, is_default: false },
    { client_id: client.id as string, label: "מוסמך", kind: "open", sort_order: 2, is_default: false },
    { client_id: client.id as string, label: "נסגר", kind: "won", sort_order: 3, is_default: false },
    { client_id: client.id as string, label: "אבד", kind: "lost", sort_order: 4, is_default: false },
  ]);
  if (statusError) throw new Error(statusError.message);

  await dispatchWebhook("client_created_questionnaire", { clientId: client.id, clientName: client.name });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export interface UpdateClientInput {
  name?: string;
  business_type?: string;
  contact_info?: Record<string, unknown>;
  deal_price_avg?: number | null;
  close_rate_pct?: number | null;
  monthly_revenue?: number | null;
  deals_per_month?: number | null;
  price_range_low?: number | null;
  price_range_high?: number | null;
  profit_ratio?: number;
  meta_ad_account_id?: string | null;
  drive_links?: DriveLink[];
  strategy_call_recording_url?: string | null;
  strategy_call_transcript_url?: string | null;
}

function numOrNull(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function createClientFromForm(formData: FormData) {
  await createClient({
    name: String(formData.get("name") ?? ""),
    business_type: String(formData.get("business_type") ?? "other"),
    contact_info: { phone: String(formData.get("phone") ?? "") },
    deal_price_avg: numOrNull(formData, "deal_price_avg"),
    close_rate_pct: numOrNull(formData, "close_rate_pct"),
    monthly_revenue: numOrNull(formData, "monthly_revenue"),
    deals_per_month: numOrNull(formData, "deals_per_month"),
    price_range_low: numOrNull(formData, "price_range_low"),
    price_range_high: numOrNull(formData, "price_range_high"),
    profit_ratio: numOrNull(formData, "profit_ratio") ?? 5,
    baseline: {
      leads_per_month: numOrNull(formData, "baseline_leads_per_month"),
      avg_cost_per_lead: numOrNull(formData, "baseline_avg_cost_per_lead"),
      revenue: numOrNull(formData, "baseline_revenue"),
      close_rate_pct: numOrNull(formData, "baseline_close_rate_pct"),
      product_price: numOrNull(formData, "baseline_product_price"),
    },
  });
}

export async function updateClient(clientId: string, input: UpdateClientInput) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("clients").update(input).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}

export async function updateClientFromForm(clientId: string, formData: FormData) {
  let driveLinks: DriveLink[] | undefined;
  const rawDriveLinks = formData.get("drive_links");
  if (typeof rawDriveLinks === "string" && rawDriveLinks.trim() !== "") {
    try {
      driveLinks = JSON.parse(rawDriveLinks) as DriveLink[];
    } catch {
      throw new Error("כפתורי Drive: פורמט לא תקין.");
    }
  }

  await updateClient(clientId, {
    name: String(formData.get("name") ?? ""),
    business_type: String(formData.get("business_type") ?? "other"),
    contact_info: { phone: String(formData.get("phone") ?? "") },
    deal_price_avg: numOrNull(formData, "deal_price_avg"),
    close_rate_pct: numOrNull(formData, "close_rate_pct"),
    monthly_revenue: numOrNull(formData, "monthly_revenue"),
    deals_per_month: numOrNull(formData, "deals_per_month"),
    price_range_low: numOrNull(formData, "price_range_low"),
    price_range_high: numOrNull(formData, "price_range_high"),
    profit_ratio: numOrNull(formData, "profit_ratio") ?? 5,
    meta_ad_account_id: String(formData.get("meta_ad_account_id") ?? "").trim() || null,
    drive_links: driveLinks,
    strategy_call_recording_url: String(formData.get("strategy_call_recording_url") ?? "") || null,
    strategy_call_transcript_url: String(formData.get("strategy_call_transcript_url") ?? "") || null,
  });
}
