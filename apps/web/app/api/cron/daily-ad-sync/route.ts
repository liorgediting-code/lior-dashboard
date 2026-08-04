import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-secret";
import { syncAllClients } from "@/lib/meta/sync";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncAllClients();
  return NextResponse.json({ ok: true, results });
}
