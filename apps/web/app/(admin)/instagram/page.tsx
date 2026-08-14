import { supabaseAdmin } from "@/lib/supabase/admin";
import { isInstagramConfigured } from "@/lib/instagram/client";
import { fetchAllMedia, fetchDailyMetrics } from "@/lib/instagram/fetch-insights";
import { formatNumber, formatPercent } from "@/lib/format";
import { sortByPerformance, sortTrend, summarizeAccountMetrics, truncateCaption, type PeriodChange } from "@/lib/instagram/metrics";
import { trailingDays } from "@/lib/metrics/campaign-stats";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

const MEDIA_TYPE_LABELS: Record<string, string> = {
  IMAGE: "תמונה",
  VIDEO: "וידאו",
  CAROUSEL_ALBUM: "קרוסלה",
  REELS: "ריל",
};

function ChangeBadge({ change }: { change: PeriodChange }) {
  if (change.changePct === null) {
    return <span className="text-xs text-slate-400">אין נתון להשוואה</span>;
  }
  const positive = change.changePct >= 0;
  return (
    <span className={positive ? "badge badge-winner" : "badge badge-kill"}>
      {positive ? "+" : ""}
      {formatPercent(change.changePct)}
    </span>
  );
}

function SummaryCard({ label, change, unit }: { label: string; change: PeriodChange; unit?: string }) {
  return (
    <div className="card">
      <p className="mb-1 text-sm text-slate-500">{label}</p>
      <p className="mb-1 text-2xl font-bold">
        {change.current === null ? "—" : formatNumber(change.current)}
        {unit && change.current !== null ? ` ${unit}` : ""}
      </p>
      <ChangeBadge change={change} />
    </div>
  );
}

function TrendChart({ points }: { points: Array<{ date: string; reach: number | null; views: number | null }> }) {
  const max = Math.max(1, ...points.map((p) => p.views ?? p.reach ?? 0));
  return (
    <div className="flex h-32 items-end gap-0.5" dir="ltr">
      {points.map((p) => {
        const value = p.views ?? p.reach;
        const heightPct = value === null ? 0 : Math.max(2, (value / max) * 100);
        return (
          <div
            key={p.date}
            className={value === null ? "flex-1 rounded-t bg-slate-100" : "flex-1 rounded-t bg-slate-400"}
            style={{ height: `${heightPct}%` }}
            title={`${p.date}: ${value === null ? "אין נתון" : formatNumber(value)}`}
          />
        );
      })}
    </div>
  );
}

export default async function InstagramInsightsPage() {
  if (!isInstagramConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-2xl font-bold">אינסטגרם</h1>
        <div className="card">
          <p className="mb-2 font-medium">חיבור אינסטגרם עדיין לא הוגדר.</p>
          <p className="text-sm text-slate-600">
            הריצו <code className="rounded bg-slate-100 px-1 py-0.5">hookmyapp channels env &lt;channel-id&gt;</code> והוסיפו את
            המשתנים <code className="rounded bg-slate-100 px-1 py-0.5">INSTAGRAM_GRAPH_API_URL</code>,{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">INSTAGRAM_ACCOUNT_ID</code> ו-
            <code className="rounded bg-slate-100 px-1 py-0.5">INSTAGRAM_ACCESS_TOKEN</code> לקובץ{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">apps/web/.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  const supabase = supabaseAdmin();
  const current = trailingDays(WINDOW_DAYS);
  const prevUntilDate = new Date(`${current.since}T00:00:00Z`);
  prevUntilDate.setUTCDate(prevUntilDate.getUTCDate() - 1);
  const previous = trailingDays(WINDOW_DAYS, prevUntilDate);

  const [currentRows, previousRows, media] = await Promise.all([
    fetchDailyMetrics(supabase, current.since, current.until),
    fetchDailyMetrics(supabase, previous.since, previous.until),
    fetchAllMedia(supabase),
  ]);

  const hasAnyData = currentRows.length > 0 || previousRows.length > 0 || media.length > 0;

  if (!hasAnyData) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-2xl font-bold">אינסטגרם</h1>
        <div className="card">
          <p className="text-slate-600">
            עדיין אין נתוני אינסטגרם מסונכרנים. הריצו את הסנכרון היומי (cron) כדי למשוך נתונים מהחשבון.
          </p>
        </div>
      </div>
    );
  }

  const summary = summarizeAccountMetrics(currentRows, previousRows);
  const trend = sortTrend(currentRows);
  const posts = sortByPerformance(media);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">אינסטגרם</h1>
      <p className="mb-4 text-sm text-slate-500">
        {WINDOW_DAYS} הימים האחרונים לעומת {WINDOW_DAYS} הימים שלפני כן · נתונים עשויים להתעדכן עד 48 שעות אחורה, וחלק
        מהמדדים מוסתרים ע״י אינסטגרם בחשבונות קטנים
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="חשיפה (Reach)" change={summary.reach} />
        <SummaryCard label="צפיות (Views)" change={summary.views} />
        <SummaryCard label="אינטראקציות" change={summary.totalInteractions} />
        <SummaryCard label="צפיות בפרופיל" change={summary.profileViews} />
        <SummaryCard label="עוקבים" change={summary.followers} />
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">מגמת חשיפה/צפיות — {WINDOW_DAYS} ימים אחרונים</h2>
        {trend.length > 0 ? <TrendChart points={trend} /> : <p className="text-sm text-slate-500">אין עדיין נתוני מגמה.</p>}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">פוסטים לפי ביצועים</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500">אין עדיין פוסטים מסונכרנים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="text-right text-slate-500">
                  <th className="pb-1 font-normal">פוסט</th>
                  <th className="pb-1 font-normal">סוג</th>
                  <th className="pb-1 font-normal">תאריך</th>
                  <th className="pb-1 font-normal">צפיות</th>
                  <th className="pb-1 font-normal">חשיפה</th>
                  <th className="pb-1 font-normal">לייקים</th>
                  <th className="pb-1 font-normal">תגובות</th>
                  <th className="pb-1 font-normal">שמירות</th>
                  <th className="pb-1 font-normal">שיתופים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((post) => (
                  <tr key={post.media_id}>
                    <td className="max-w-xs py-2">
                      <a
                        href={post.permalink ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 hover:underline"
                      >
                        {post.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element -- external Graph API thumbnail; no next/image domain configured for it elsewhere in the project
                          <img src={post.thumbnail_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                        )}
                        <span className="truncate">{truncateCaption(post.caption) || "(ללא כיתוב)"}</span>
                      </a>
                    </td>
                    <td className="py-2">{MEDIA_TYPE_LABELS[post.media_type ?? ""] ?? post.media_type ?? "—"}</td>
                    <td className="py-2">{post.posted_at ? new Date(post.posted_at).toLocaleDateString("he-IL") : "—"}</td>
                    <td className="py-2">{formatNumber(post.views)}</td>
                    <td className="py-2">{formatNumber(post.reach)}</td>
                    <td className="py-2">{formatNumber(post.likes)}</td>
                    <td className="py-2">{formatNumber(post.comments_count)}</td>
                    <td className="py-2">{formatNumber(post.saved)}</td>
                    <td className="py-2">{formatNumber(post.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
