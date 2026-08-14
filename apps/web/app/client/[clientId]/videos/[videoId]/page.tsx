import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { PortalTabs } from "@/components/portal-tabs";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { VideoReviewPlayer } from "@/components/video-review-player";
import { VIDEO_GRANT_PARAM, signVideoGrant } from "@/lib/videos/stream-grant";
import type { ClientVideo, VideoComment } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalVideoPage({ params }: { params: { clientId: string; videoId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: video }, { data: commentRows }, tabsData] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    supabase.from("client_videos").select("*").eq("id", params.videoId).eq("client_id", params.clientId).maybeSingle(),
    supabase.from("video_comments").select("*").eq("video_id", params.videoId).order("timestamp_seconds", { ascending: true }),
    getPortalTabsData(supabase, params.clientId),
  ]);
  if (!client || !video) notFound();

  const typedVideo = video as ClientVideo;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <PortalTabs clientId={params.clientId} active="videos" {...tabsData} />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{typedVideo.name}</h2>
        <Link href={`/client/${params.clientId}/videos`} className="text-sm text-indigo-700 underline">
          כל הסרטונים
        </Link>
      </div>

      <VideoReviewPlayer
        videoId={typedVideo.id}
        clientId={params.clientId}
        streamUrl={`/api/videos/${typedVideo.id}/stream?${VIDEO_GRANT_PARAM}=${signVideoGrant(typedVideo.id)}`}
        durationSeconds={typedVideo.duration_seconds != null ? Number(typedVideo.duration_seconds) : null}
        comments={(commentRows ?? []) as VideoComment[]}
        isAgencyView={false}
      />
    </div>
  );
}
