import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLead } from "@/lib/actions/leads";
import { loadFieldMapper } from "@/lib/crm/fetch-webhook-mapping";

/**
 * Generic lead intake for external automation tools (Make/Zapier/n8n/etc.)
 * that can call an arbitrary webhook URL. Each client has their own URL +
 * secret (shown on their edit page), so no shared credential to leak.
 *
 * Accepts a loose JSON body. Where each key lands is configurable per client
 * ("מבנה ה-Webhook" in the CRM panel) — name/full_name, phone/phone_number
 * and email map to their leads columns with no setup, and anything else can
 * be pointed at a custom CRM column. Unmapped keys are still kept in
 * custom_fields under their raw name, so no incoming data is ever lost.
 */
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

  const mapFields = await loadFieldMapper(client.id as string);
  const mapped = mapFields(body);

  try {
    const lead = await createLead({
      client_id: client.id as string,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      custom_fields: mapped.custom_fields,
    });
    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed to create lead" }, { status: 500 });
  }
}
