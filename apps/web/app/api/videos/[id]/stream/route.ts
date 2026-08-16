import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "@/lib/auth/client-session";
import { DriveNotConfiguredError, fetchDriveFileBytes } from "@/lib/videos/drive";
import { VIDEO_GRANT_PARAM, verifyVideoGrant } from "@/lib/videos/stream-grant";
import { buildStreamResponseInit, isDriveFailure, mapDriveFailureStatus } from "@/lib/videos/stream-response";

/**
 * Streams one video's bytes from Drive, forwarding Range so the <video>
 * element can seek.
 *
 * SECURITY: this URL is guessable (a UUID in the path) and serves client ad
 * footage, so access is proven, never assumed. Two ways in, and absence of
 * evidence is NOT one of them:
 *
 *   1. a signed grant for THIS video id, minted by a page that already
 *      established the caller is entitled (see lib/videos/stream-grant.ts);
 *   2. a portal session cookie whose client owns the video.
 *
 * Deliberately unlike `assertCrmAccess`, which passes when no session cookie
 * is present. That contract is fine for server actions behind the
 * open-by-design admin pages, but on a public GET it would mean a portal
 * client could delete their own cookie and read every other client's
 * footage — the cross-client leak this repo already shipped once
 * (docs/PROJECT_STATUS.md, 2026-08-09), reintroduced through the back door.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const { data: video, error } = await supabase
    .from("client_videos")
    .select("id, client_id, drive_file_id, mime_type")
    .eq("id", params.id)
    .maybeSingle();

  // An unapplied migration (table doesn't exist yet) or a bad id must
  // surface as a clean 404, not an unhandled 500 with a stack trace.
  if (error || !video) {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }

  // Grant first, session second. An admin using the "enter as client"
  // shortcut can be holding a cookie for a DIFFERENT client than the video
  // they're reviewing; checking the cookie first would 403 them despite the
  // server having just minted them a valid grant.
  const grant = req.nextUrl.searchParams.get(VIDEO_GRANT_PARAM);
  if (!verifyVideoGrant(grant, video.id as string)) {
    const session = verifyClientSession(cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value);
    if (!session || session.clientId !== (video.client_id as string)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
  }

  let driveRes: Response;
  try {
    driveRes = await fetchDriveFileBytes(video.drive_file_id as string, req.headers.get("range"));
  } catch (err) {
    if (err instanceof DriveNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  if (isDriveFailure(driveRes.status)) {
    return NextResponse.json(
      { error: `drive returned ${driveRes.status}` },
      { status: mapDriveFailureStatus(driveRes.status) }
    );
  }

  // Header/status shaping lives in lib/videos/stream-response.ts so it can
  // be tested without Drive credentials — it's the logic that decides
  // whether seeking works, and it fails silently when wrong.
  const { status, headers } = buildStreamResponseInit(
    driveRes.status,
    driveRes.headers,
    video.mime_type as string | null
  );

  // Body streams through as-is — never buffer a whole video into memory.
  return new NextResponse(driveRes.body, { status, headers });
}
