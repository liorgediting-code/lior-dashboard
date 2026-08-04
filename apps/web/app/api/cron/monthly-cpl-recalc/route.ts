import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-secret";
import { recalcAllClientThresholds } from "@/lib/analyzer/monthly-recalc";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await recalcAllClientThresholds();
  return NextResponse.json({ ok: true, ...result });
}
