import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "@/lib/auth/client-session";
import { DriveNotConfiguredError, fetchDriveFileBytes } from "@/lib/videos/drive";
import { VIDEO_GRANT_PARAM, verifyVideoGrant } from "@/lib/videos/stream-grant";

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

  if (!driveRes.ok && driveRes.status !== 206) {
    return NextResponse.json(
      { error: `drive returned ${driveRes.status}` },
      { status: driveRes.status === 404 ? 404 : 502 }
    );
  }

  // Whitelist only — never spread Drive's own headers through, several of
  // which (auth-adjacent, CORS) must not leak to the browser verbatim.
  const headers = new Headers();
  const contentType = driveRes.headers.get("content-type") ?? (video.mime_type as string | null);
  if (contentType) headers.set("Content-Type", contentType);
  const contentLength = driveRes.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = driveRes.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  headers.set("Accept-Ranges", "bytes");

  // Pass Drive's status straight through: 206 stays 206 when a Range was
  // honoured, 200 when the whole file came back. Body streams through as-is
  // — never buffer a whole video into memory.
  return new NextResponse(driveRes.body, { status: driveRes.status, headers });
}
