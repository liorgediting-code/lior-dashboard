import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/lib/actions/leads";

const bodySchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

/**
 * Plain HTTP endpoint the agency's own client websites post to — fully
 * testable locally with `curl`, no external credentials required.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const lead = await createLead({
    client_id: parsed.data.client_id,
    name: parsed.data.name ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}
