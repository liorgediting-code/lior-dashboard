import { NextRequest, NextResponse } from "next/server";

/**
 * Real Meta Lead Ads webhook shape (GET verify handshake + POST payload
 * per Meta's webhook spec). Unverifiable end-to-end without a real Meta
 * App + Lead Ads form pointed at this URL.
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

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as MetaWebhookPayload;

  // NOTE: client_id resolution from ad_id -> ads.id -> adsets -> campaigns
  // -> client_id is intentionally left as a TODO here: it needs a real
  // ad_id from Meta to look up, which only exists once campaigns are
  // synced from a live ad account (phase 2's built-but-unverifiable bucket).
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const fields = change.value.field_data ?? [];
      const name = fields.find((f) => f.name === "full_name")?.values?.[0] ?? null;
      const phone = fields.find((f) => f.name === "phone_number")?.values?.[0] ?? null;
      console.info("[webhook:meta-leads] received lead (client resolution TODO)", { name, phone, adId: change.value.ad_id });
    }
  }

  return NextResponse.json({ ok: true });
}
