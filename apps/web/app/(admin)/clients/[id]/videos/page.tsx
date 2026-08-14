import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { VideoReviewPlayer } from "@/components/video-review-player";
import { VideoSyncButton } from "@/components/video-sync-button";
import { fetchClientVideosWithComments } from "@/lib/videos/fetch-videos";
import { VIDEO_GRANT_PARAM, signVideoGrant } from "@/lib/videos/stream-grant";

export const dynamic = "force-dynamic";

export default async function ClientVideosAdminPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { videos, commentsByVideoId }] = await Promise.all([
    // `*` rather than naming drive_folder_id: naming a column that the
    // phase-20 migration has not added yet makes the whole select fail, and
    // the page 404s on a client that plainly exists. With `*` the field is
    // simply absent until the migration lands.
    supabase.from("clients").select("*").eq("id", params.id).single(),
    fetchClientVideosWithComments(supabase, params.id),
  ]);
  if (!client) notFound();

  const hasFolder = Boolean(client.drive_folder_id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="videos" />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {hasFolder ? "סרטונים נקראים ישירות מתיקיית Drive של הלקוח." : "לא הוגדרה תיקיית Drive ללקוח הזה — הוסיפו drive_folder_id בעריכת הלקוח."}
        </p>
        {hasFolder && <VideoSyncButton clientId={params.id} />}
      </div>

      <div className="space-y-6">
        {videos.map((video) => (
          <div key={video.id} className="card">
            <h2 className="mb-2 font-semibold">{video.name}</h2>
            <VideoReviewPlayer
              videoId={video.id}
              clientId={params.id}
              streamUrl={`/api/videos/${video.id}/stream?${VIDEO_GRANT_PARAM}=${signVideoGrant(video.id)}`}
              durationSeconds={video.duration_seconds != null ? Number(video.duration_seconds) : null}
              comments={commentsByVideoId.get(video.id) ?? []}
              isAgencyView
            />
          </div>
        ))}

        {videos.length === 0 && (
          <div className="card">
            <p className="text-slate-500">אין עדיין סרטונים סונכרנים ללקוח הזה.</p>
          </div>
        )}
      </div>
    </div>
  );
}
