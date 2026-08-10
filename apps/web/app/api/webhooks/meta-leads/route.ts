import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLead } from "@/lib/actions/leads";
import { loadFieldMapper } from "@/lib/crm/fetch-webhook-mapping";

/**
 * Real Meta Lead Ads webhook shape (GET verify handshake + POST payload
 * per Meta's webhook spec).
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

interface MetaLeadgenChange {
  value: { leadgen_id: string; form_id: string; ad_id?: string; field_data?: Array<{ name: string; values: string[] }> };
}
interface MetaWebhookPayload {
  entry: Array<{ changes: MetaLeadgenChange[] }>;
}

// Resolves a Meta ad_id (as it appears in the webhook payload) to the
// client that owns it, by walking ads -> adsets -> campaigns, all of
// which are keyed by Meta's own ids once synced via lib/meta/sync.ts.
// Returns null if the ad hasn't been synced yet (nothing to resolve to).
async function resolveClientIdFromAdId(adId: string): Promise<{ clientId: string; adRowId: string } | null> {
  const supabase = supabaseAdmin();
  const { data: ad } = await supabase.from("ads").select("id, adset_id").eq("meta_id", adId).maybeSingle();
  if (!ad) return null;

  const { data: adset } = await supabase.from("adsets").select("campaign_id").eq("id", ad.adset_id as string).maybeSingle();
  if (!adset) return null;

  const { data: campaign } = await supabase.from("campaigns").select("client_id").eq("id", adset.campaign_id as string).maybeSingle();
  if (!campaign) return null;

  return { clientId: campaign.client_id as string, adRowId: ad.id as string };
}

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as MetaWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { leadgen_id: leadgenId, ad_id: adId } = change.value;
      const fields = change.value.field_data ?? [];

      // Every answer on the form, not just the three standard ones — the
      // client's own lead-form questions used to be dropped here. Flattened
      // to { question name: values } so the per-client mapping decides which
      // CRM column each one lands in.
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        payload[field.name] = field.values;
      }

      if (!adId) {
        console.info("[webhook:meta-leads] no ad_id on payload, skipping", { leadgenId });
        continue;
      }
      const resolved = await resolveClientIdFromAdId(adId);
      if (!resolved) {
        console.info("[webhook:meta-leads] ad_id not synced to a client yet, skipping", { adId, leadgenId });
        continue;
      }

      try {
        const mapFields = await loadFieldMapper(resolved.clientId);
        const mapped = mapFields(payload);
        await createLead({
          client_id: resolved.clientId,
          name: mapped.name,
          phone: mapped.phone,
          email: mapped.email,
          custom_fields: mapped.custom_fields,
          source_ad_id: resolved.adRowId,
          meta_leadgen_id: leadgenId,
        });
      } catch (err) {
        // Meta retries webhook deliveries; the unique index on
        // meta_leadgen_id makes a duplicate delivery a harmless no-op here.
        console.error("[webhook:meta-leads] failed to create lead", { adId, leadgenId, err });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
