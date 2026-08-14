import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { PortalTabs } from "@/components/portal-tabs";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import { fetchClientVideosWithComments } from "@/lib/videos/fetch-videos";
import { formatTimestamp, sortByTimestamp } from "@/lib/videos/review-geometry";

export const dynamic = "force-dynamic";

export default async function ClientPortalVideosPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, tabsData, { videos, commentsByVideoId }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    getPortalTabsData(supabase, params.clientId),
    fetchClientVideosWithComments(supabase, params.clientId),
  ]);
  if (!client) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <PortalTabs clientId={params.clientId} active="videos" {...tabsData} />

      <div className="space-y-3">
        {videos.map((video) => {
          const comments = commentsByVideoId.get(video.id) ?? [];
          const open = comments.filter((c) => !c.resolved_at).length;
          const lastComment = sortByTimestamp(comments).slice(-1)[0];
          return (
            <Link key={video.id} href={`/client/${params.clientId}/videos/${video.id}`} className="card block hover:border-blue-300">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{video.name}</p>
                  <p className="text-xs text-slate-500">
                    {comments.length === 0
                      ? "אין עדיין הערות"
                      : `${comments.length} הערות${open > 0 ? ` · ${open} פתוחות` : ""}${
                          lastComment ? ` · אחרונה ב-${formatTimestamp(Number(lastComment.timestamp_seconds))}` : ""
                        }`}
                  </p>
                </div>
                <span className="btn btn-primary text-sm">צפה וסמן הערות</span>
              </div>
            </Link>
          );
        })}

        {videos.length === 0 && (
          <div className="card">
            <p className="text-slate-500">עדיין לא הועלו סרטונים לבדיקה עבורך.</p>
          </div>
        )}
      </div>
    </div>
  );
}
