import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-secret";
import { runAlertsCheck } from "@/lib/notifications/alerts-check";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runAlertsCheck();
  return NextResponse.json({ ok: true, ...result });
}
