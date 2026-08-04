import { NextRequest, NextResponse } from "next/server";
import { approveGateViaMagicLink } from "@/lib/sop/actions";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const result = await approveGateViaMagicLink(params.token);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "approval failed" }, { status: 400 });
  }
}
