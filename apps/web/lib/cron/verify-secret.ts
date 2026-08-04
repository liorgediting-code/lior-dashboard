import "server-only";
import { NextRequest } from "next/server";

/** Shared secret n8n/Make/Vercel Cron must send as `x-cron-secret`. */
export function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}
