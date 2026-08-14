import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-secret";
import { syncInstagramInsights } from "@/lib/instagram/insights";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncInstagramInsights();
  return NextResponse.json({ ok: true, results });
}
