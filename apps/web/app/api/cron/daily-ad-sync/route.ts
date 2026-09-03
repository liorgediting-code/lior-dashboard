import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-secret";
import { syncAllClients } from "@/lib/meta/sync";

/**
 * A one-off backfill needs a longer reach than the nightly run.
 *
 * The default 3 days is right for a daily cron (cheap, and enough to catch
 * Meta's late attribution restatements), but it makes a freshly connected ad
 * account look empty: a campaign that last spent a month ago has nothing
 * inside a 3-day window, and the operator cannot tell that from a broken
 * connection. `?days=` lets that same account be pulled in once.
 *
 * Capped rather than unbounded: `level=ad` with `time_increment=1` returns
 * one row per ad per day, so a multi-year request on a busy account is a very
 * large paged fetch against a rate-limited API.
 */
const MAX_LOOKBACK_DAYS = 730;
const DEFAULT_LOOKBACK_DAYS = 3;

function parseLookbackDays(raw: string | null): number {
  if (raw === null) return DEFAULT_LOOKBACK_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.floor(parsed), MAX_LOOKBACK_DAYS);
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const lookbackDays = parseLookbackDays(req.nextUrl.searchParams.get("days"));
  const results = await syncAllClients(lookbackDays);
  return NextResponse.json({ ok: true, lookbackDays, results });
}
