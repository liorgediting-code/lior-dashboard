"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "@/lib/auth/client-session";
import { syncClientVideos } from "@/lib/videos/drive";
import type { VideoDrawing } from "@dashboard-lior/shared";

/** Both the admin and portal pages show the same comments, so a write on either side must invalidate both. */
function revalidateVideoPages(clientId: string) {
  revalidatePath(`/clients/${clientId}/videos`);
  revalidatePath(`/client/${clientId}/videos`);
}

/**
 * Same inference the stream route uses: a portal session cookie present ->
 * the caller is that client leaving a note; absent -> the agency. Never
 * trust an "author_kind" field posted from a form — a client could just
 * set it to "agency" and their note would look like it came from us.
 */
function inferAuthorKind(): "client" | "agency" {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  return cookieValue && verifyClientSession(cookieValue) ? "client" : "agency";
}

export async function syncVideosForClient(clientId: string): Promise<{ synced: number }> {
  assertCrmAccess(clientId);

  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("drive_folder_id").eq("id", clientId).maybeSingle();
  const folderId = client?.drive_folder_id as string | null | undefined;
  if (!folderId) throw new Error("ללקוח הזה לא הוגדרה תיקיית Drive");

  const synced = await syncClientVideos(clientId, folderId);
  revalidateVideoPages(clientId);
  return { synced };
}

export async function addVideoComment(input: {
  videoId: string;
  timestampSeconds: number;
  body: string;
  drawing: VideoDrawing | null;
}): Promise<void> {
  const supabase = supabaseAdmin();

  // Ownership is READ FROM THE VIDEO, never taken from the caller. When the
  // client id was a parameter, a portal client could post another client's
  // videoId alongside their OWN clientId: assertCrmAccess saw a matching
  // cookie and passed, and the comment landed on a video they cannot see.
  // The two ids have to agree, and only the database knows which is true.
  const { data: video } = await supabase
    .from("client_videos")
    .select("id, client_id")
    .eq("id", input.videoId)
    .maybeSingle();
  if (!video) throw new Error("הסרטון לא נמצא");

  const clientId = video.client_id as string;
  assertCrmAccess(clientId);
  const authorKind = inferAuthorKind();

  const { error } = await supabase.from("video_comments").insert({
    video_id: input.videoId,
    client_id: clientId,
    // Kept as a fraction on purpose — rounding here would put the
    // reviewer and the editor on different frames (see the migration).
    timestamp_seconds: input.timestampSeconds,
    body: input.body,
    drawing: input.drawing,
    author_kind: authorKind,
    author_name: authorKind === "agency" ? "הסוכנות" : null,
  });
  if (error) throw new Error(error.message);

  revalidateVideoPages(clientId);
}

/** Agency-only: ticks a fix off as handled. Not an approval workflow, just keeps the list readable. */
export async function resolveVideoComment(commentId: string): Promise<void> {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  if (cookieValue && verifyClientSession(cookieValue)) {
    throw new Error("רק הסוכנות יכולה לסמן תיקון כטופל");
  }

  const supabase = supabaseAdmin();
  // Read the owning client back rather than accepting it as an argument —
  // it only drives revalidation, but a wrong value there silently leaves
  // the real client's page showing a stale, still-open fix.
  const { data: comment } = await supabase
    .from("video_comments")
    .select("id, client_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) throw new Error("ההערה לא נמצאה");

  const { error } = await supabase
    .from("video_comments")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) throw new Error(error.message);

  revalidateVideoPages(comment.client_id as string);
}
