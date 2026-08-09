import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLead } from "@/lib/actions/leads";

/**
 * Generic lead intake for external automation tools (Make/Zapier/n8n/etc.)
 * that can call an arbitrary webhook URL. Each client has their own URL +
 * secret (shown on their edit page), so no shared credential to leak.
 *
 * Accepts a loose JSON body — any of name/full_name, phone/phone_number,
 * email are mapped to leads columns; every other key is kept as-is in
 * leads.custom_fields so this works with whatever field names the
 * client's form/automation tool happens to send.
 */
const KNOWN_KEYS: Record<string, "name" | "phone" | "email"> = {
  name: "name",
  full_name: "name",
  phone: "phone",
  phone_number: "phone",
  email: "email",
};

export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  const supabase = supabaseAdmin();
  const { data: client } = await supabase
    .from("clients")
    .select("id, webhook_secret")
    .eq("id", params.clientId)
    .maybeSingle();

  if (!client || !client.webhook_secret || secret !== client.webhook_secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mapped: { name?: string; phone?: string; email?: string } = {};
  const customFields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(body)) {
    const target = KNOWN_KEYS[key.toLowerCase()];
    if (target) {
      mapped[target] = String(value ?? "");
    } else if (typeof value === "string" || typeof value === "number") {
      customFields[key] = value;
    }
  }

  try {
    const lead = await createLead({
      client_id: client.id as string,
      name: mapped.name || null,
      phone: mapped.phone || null,
      email: mapped.email || null,
      custom_fields: customFields,
    });
    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed to create lead" }, { status: 500 });
  }
}
