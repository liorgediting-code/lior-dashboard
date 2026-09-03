import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ActionBadge, DiagnosisList } from "@/components/diagnostics/diagnosis-list";
import { FunnelStrip } from "@/components/diagnostics/funnel-strip";
import { CampaignGoalForm } from "@/components/diagnostics/campaign-goal-form";
import { fetchCampaignDiagnoses } from "@/lib/diagnostics/fetch";
import { trailingDays } from "@/lib/metrics/campaign-stats";
import { campaignActivity, formatCampaignStatus } from "@/lib/metrics/campaign-status";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { DiagnosticResult } from "@/lib/diagnostics/engine";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 14, 30] as const;

function parseWindow(value: string | undefined): number {
  const parsed = Number(value);
  return (WINDOWS as readonly number[]).includes(parsed) ? parsed : 30;
}

function percent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}%`;
}

/**
 * One campaign, all the way down: every diagnosis it triggered, the raw
 * funnel counts behind them, and the same verdict computed per ad.
 *
 * The per-ad table is the point of the page. A campaign-level "weak hook" is
 * usually one ad dragging three good ones down, and the campaign average
 * cannot tell you which — so the fix ("swap the opening frame") lands on the
 * wrong creative unless the ads are broken out.
 */
export default async function CampaignAnalysisPage({
  params,
  searchParams,
}: {
  params: { campaignId: string };
  searchParams: { window?: string };
}) {
  const windowDays = parseWindow(searchParams.window);
  const supabase = supabaseAdmin();

  const { data: campaignRow } = await supabase.from("campaigns").select("client_id").eq("id", params.campaignId).maybeSingle();
  if (!campaignRow) notFound();

  const rows = await fetchCampaignDiagnoses(
    supabase,
    { clientId: campaignRow.client_id as string },
    trailingDays(windowDays),
    `${windowDays} ימים`
  );
  const row = rows.find((candidate) => candidate.campaign.id === params.campaignId);
  if (!row) notFound();

  const { campaign, clientName, result, ads, thresholds, baseline } = row;
  const hasVideo = (result.metrics.hookRate ?? 0) > 0;
  const activity = campaignActivity(campaign.status);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/ad-analysis?window=${windowDays}`} className="text-sm text-blue-700 hover:underline">
          → חזרה לניתוח מודעות
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{campaign.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href={`/clients/${campaign.client_id}`} className="hover:underline">
            {clientName}
          </Link>
          <span className={activity === "active" ? "badge badge-winner" : "badge badge-insufficient"}>{formatCampaignStatus(campaign.status)}</span>
          <span>{windowDays} הימים האחרונים</span>
          {result.primaryBottleneck && <ActionBadge action={result.primaryBottleneck} prefix="קודם כל:" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {WINDOWS.map((days) => (
          <Link
            key={days}
            href={`/ad-analysis/${campaign.id}?window=${days}`}
            className={`rounded px-2 py-1 text-sm ${windowDays === days ? "bg-slate-200 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {days} ימים
          </Link>
        ))}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">המשפך</h2>
        <FunnelStrip result={result} thresholds={thresholds} hasVideo={hasVideo} />

        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="הוצאה" value={formatCurrency(result.metrics.spend)} />
          <Metric label="חשיפות" value={formatNumber(result.metrics.impressions)} />
          <Metric label="קליקים על לינק" value={formatNumber(result.metrics.linkClicks)} />
          <Metric label="המרות" value={formatNumber(result.metrics.conversions)} />
          <Metric label="CPC" value={formatCurrency(result.metrics.cpc)} />
          <Metric label="CPM" value={formatCurrency(result.metrics.cpm)} />
        </div>

        <p className="text-xs text-slate-400">
          ממוצע החשבון בחלון הזה: CPC {formatCurrency(baseline.avgCpc)} · CPM {formatCurrency(baseline.avgCpm)}. כללי
          ה-CPC/CPM נמדדים מולו, לא מול מספר קבוע.
          {" "}
          התדירות מחושבת מסכום ההגעה היומית, שהיא הערכת־יתר — כלומר התדירות בפועל גבוהה או שווה למוצג.
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">כלכלת הקמפיין</h2>
        <CampaignGoalForm campaignId={campaign.id} targetCpa={campaign.target_cpa} conversionGoal={campaign.conversion_goal ?? "leads"} />
        {campaign.target_cpa === null && (
          <p className="text-xs text-slate-500">
            בלי יעד CPA השלב האחרון במשפך שותק — אין דרך כנה לקבוע ש-{formatCurrency(result.metrics.cpa)} זה «יקר מדי»
            מול מספר שאף אחד לא נתן.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">ממצאים ({result.diagnoses.length})</h2>
        {result.status === "insufficient_data" && <div className="card text-sm text-slate-500">{result.insufficientReasonHe}</div>}
        {result.status === "healthy" && (
          <div className="card text-sm text-emerald-700">כל שלבי המשפך עוברים את הספים. אין המלצת שינוי.</div>
        )}
        {result.diagnoses.length > 0 && <DiagnosisList diagnoses={result.diagnoses} />}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">פירוט לפי מודעה</h2>
        {ads.length === 0 ? (
          <p className="text-sm text-slate-500">אין מודעות מסונכרנות תחת הקמפיין הזה.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="text-right text-slate-500">
                  <th className="pb-1 font-normal">מודעה</th>
                  <th className="pb-1 font-normal">קבוצה</th>
                  <th className="pb-1 font-normal">הוצאה</th>
                  <th className="pb-1 font-normal">Hook</th>
                  <th className="pb-1 font-normal">Hold</th>
                  <th className="pb-1 font-normal">CTR</th>
                  <th className="pb-1 font-normal">המרות</th>
                  <th className="pb-1 font-normal">CPA</th>
                  <th className="pb-1 font-normal">אבחנה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ads.map(({ ad, adsetName, result: adResult }) => (
                  <tr key={ad.id}>
                    <td className="py-2 font-medium">{ad.name}</td>
                    <td className="py-2 text-slate-500">{adsetName}</td>
                    <td className="py-2 tabular-nums">{formatCurrency(adResult.metrics.spend)}</td>
                    <td className="py-2 tabular-nums">{percent(adResult.metrics.hookRate)}</td>
                    <td className="py-2 tabular-nums">{percent(adResult.metrics.holdRate)}</td>
                    <td className="py-2 tabular-nums">{percent(adResult.metrics.ctrLinkClick)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(adResult.metrics.conversions)}</td>
                    <td className="py-2 tabular-nums">{formatCurrency(adResult.metrics.cpa)}</td>
                    <td className="py-2">
                      <AdVerdict result={adResult} />
                    </td>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AdVerdict({ result }: { result: DiagnosticResult }) {
  if (result.status === "insufficient_data") return <span className="badge badge-insufficient">אין מספיק דאטה</span>;
  if (result.status === "healthy") return <span className="badge badge-winner">תקין</span>;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {result.primaryBottleneck && <ActionBadge action={result.primaryBottleneck} />}
      <span className="text-xs text-slate-500">{result.diagnoses[0]?.labelHe}</span>
    </span>
  );
}
