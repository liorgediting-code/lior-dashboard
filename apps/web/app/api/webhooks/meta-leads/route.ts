import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createLead } from "@/lib/actions/leads";

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
      const name = fields.find((f) => f.name === "full_name")?.values?.[0] ?? null;
      const phone = fields.find((f) => f.name === "phone_number")?.values?.[0] ?? null;
      const email = fields.find((f) => f.name === "email")?.values?.[0] ?? null;

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
        await createLead({
          client_id: resolved.clientId,
          name,
          phone,
          email,
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
