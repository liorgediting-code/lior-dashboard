import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientVideo, Database, VideoComment } from "@dashboard-lior/shared";

/** One client's videos plus every comment on them, grouped by video id — shared by both the admin and portal pages. */
export async function fetchClientVideosWithComments(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<{ videos: ClientVideo[]; commentsByVideoId: Map<string, VideoComment[]> }> {
  const { data: videoRows } = await supabase
    .from("client_videos")
    .select("*")
    .eq("client_id", clientId)
    .order("synced_at", { ascending: false });
  const videos = (videoRows ?? []) as ClientVideo[];

  const videoIds = videos.map((video) => video.id);
  const { data: commentRows } = videoIds.length
    ? await supabase.from("video_comments").select("*").in("video_id", videoIds)
    : { data: [] as VideoComment[] };
  const comments = (commentRows ?? []) as VideoComment[];

  const commentsByVideoId = new Map<string, VideoComment[]>();
  for (const comment of comments) {
    const list = commentsByVideoId.get(comment.video_id) ?? [];
    list.push(comment);
    commentsByVideoId.set(comment.video_id, list);
  }

  return { videos, commentsByVideoId };
}
