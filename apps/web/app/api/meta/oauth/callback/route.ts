import { NextRequest, NextResponse } from "next/server";
import { getMetaClient } from "@/lib/meta";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Real OAuth callback — correctly shaped against the Meta Marketing API,
 * but only verifiable end-to-end once META_APP_ID/META_APP_SECRET exist
 * and META_USE_MOCK=false. With the mock client this still round-trips
 * locally (see lib/meta/mock-client.ts).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = req.nextUrl.searchParams.get("state");

  if (!code || !clientId) {
    return NextResponse.json({ error: "missing code or state (client id)" }, { status: 400 });
  }

  const meta = getMetaClient();
  const { accessToken, adAccountId } = await meta.exchangeCodeForToken(code);

  // meta_access_token is plain text for local/demo simplicity — move to a
  // proper secret store (Supabase Vault or equivalent) before going live.
  const supabase = supabaseAdmin();
  await supabase
    .from("clients")
    .update({ meta_ad_account_id: adAccountId, meta_access_token: accessToken })
    .eq("id", clientId);

  return NextResponse.redirect(new URL(`/clients/${clientId}/campaigns`, req.url));
}
