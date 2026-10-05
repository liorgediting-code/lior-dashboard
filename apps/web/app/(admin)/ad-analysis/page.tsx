import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CampaignsSyncButton } from "@/components/campaigns-sync-button";
import { ActionBadge, DiagnosisCard } from "@/components/diagnostics/diagnosis-list";
import { FunnelStrip } from "@/components/diagnostics/funnel-strip";
import { ThresholdsEditor } from "@/components/diagnostics/thresholds-editor";
import { fetchCampaignDiagnoses, type CampaignDiagnosis } from "@/lib/diagnostics/fetch";
import { resolveThresholds } from "@/lib/diagnostics/thresholds";
import { ACTION_LABELS_HE, type RecommendedAction } from "@/lib/diagnostics/rules";
import { trailingDays } from "@/lib/metrics/campaign-stats";
import { formatCampaignStatus, campaignActivity } from "@/lib/metrics/campaign-status";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Client, DiagnosticThresholds } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 14, 30] as const;
type Window = (typeof WINDOWS)[number];

type StatusFilter = "problems" | "healthy" | "insufficient" | "all";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "problems", label: "עם צוואר בקבוק" },
  { key: "healthy", label: "תקינים" },
  { key: "insufficient", label: "אין מספיק דאטה" },
  { key: "all", label: "הכל" },
];

const ACTION_ORDER: RecommendedAction[] = ["new_variations", "creative", "copy", "targeting", "landing_page", "offer_or_pricing"];

function parseWindow(value: string | undefined): Window {
  const parsed = Number(value);
  return (WINDOWS as readonly number[]).includes(parsed) ? (parsed as Window) : 30;
}

function parseStatus(value: string | undefined): StatusFilter {
  return STATUS_FILTERS.some((filter) => filter.key === value) ? (value as StatusFilter) : "problems";
}

function matchesStatus(row: CampaignDiagnosis, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "problems") return row.result.status === "bottleneck_found";
  if (filter === "healthy") return row.result.status === "healthy";
  return row.result.status === "insufficient_data";
}

/**
 * The deep ad-analysis surface: every campaign, walked down the funnel, with
 * the first gate that failed named as the thing to fix.
 *
 * Sorted by SPEND rather than by severity on purpose — a catastrophic hook
 * rate on a campaign that spent ₪12 is not the work worth doing this morning,
 * and a severity-first list buries the ₪4,000 campaign with a medium problem
 * underneath it.
 */
/** The page hosts the manual sync button; its server action runs under this limit. */
export const maxDuration = 60;

export default async function AdAnalysisPage({
  searchParams,
}: {
  searchParams: { window?: string; status?: string; client?: string; action?: string };
}) {
  const windowDays = parseWindow(searchParams.window);
  const statusFilter = parseStatus(searchParams.status);
  const clientFilter = searchParams.client ?? "all";
  const actionFilter = (searchParams.action ?? "all") as RecommendedAction | "all";

  const supabase = supabaseAdmin();
  const range = trailingDays(windowDays);

  const [rows, { data: clientRows }, { data: thresholdRows }] = await Promise.all([
    fetchCampaignDiagnoses(supabase, "all", range, `${windowDays} ימים`),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("diagnostic_thresholds").select("*"),
  ]);

  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  const thresholds = (thresholdRows ?? []) as DiagnosticThresholds[];
  const globalThresholdRow = thresholds.find((row) => row.client_id === null) ?? null;

  const scoped = rows.filter((row) => clientFilter === "all" || row.campaign.client_id === clientFilter);

  const visible = scoped
    .filter((row) => matchesStatus(row, statusFilter))
    .filter((row) => actionFilter === "all" || row.result.primaryBottleneck === actionFilter)
    .sort((a, b) => b.result.metrics.spend - a.result.metrics.spend);

  const counts = {
    problems: scoped.filter((row) => row.result.status === "bottleneck_found").length,
    healthy: scoped.filter((row) => row.result.status === "healthy").length,
    insufficient: scoped.filter((row) => row.result.status === "insufficient_data").length,
    all: scoped.length,
  };

  // Spend sitting behind each bottleneck, not just a campaign count: "4
  // campaigns need creative work" and "₪11,400 is being spent behind a
  // creative problem" prioritise very differently.
  const byAction = ACTION_ORDER.map((action) => {
    const matching = scoped.filter((row) => row.result.primaryBottleneck === action);
    return { action, count: matching.length, spend: matching.reduce((sum, row) => sum + row.result.metrics.spend, 0) };
  }).filter((entry) => entry.count > 0);

  const query = (overrides: Partial<Record<string, string>>) => {
    const params = new URLSearchParams({
      window: String(windowDays),
      status: statusFilter,
      client: clientFilter,
      action: actionFilter,
      ...overrides,
    });
    return `/ad-analysis?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">ניתוח מודעות</h1>
        <CampaignsSyncButton />
      </div>
      <p className="mb-4 text-sm text-slate-500">
        אבחון אוטומטי לפי המשפך: חשיפות ← Hook ← Hold ← CTR ← עמוד נחיתה ← CPA. לכל קמפיין מוצג השלב המוקדם ביותר שנשבר —
        הוא זה ששווה לתקן קודם.
      </p>

      {byAction.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {byAction.map((entry) => (
            <Link key={entry.action} href={query({ action: entry.action, status: "problems" })} className="card !p-3">
              <div className="text-xs text-slate-500">{ACTION_LABELS_HE[entry.action]}</div>
              <div className="text-xl font-bold tabular-nums">{entry.count}</div>
              <div className="text-xs text-slate-400 tabular-nums">{formatCurrency(entry.spend)} מאחורי הבעיה</div>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <Link
              key={filter.key}
              href={query({ status: filter.key })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === filter.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {filter.label} ({counts[filter.key]})
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 text-sm text-slate-500">
          <span>חלון:</span>
          {WINDOWS.map((days) => (
            <Link
              key={days}
              href={query({ window: String(days) })}
              className={`rounded px-2 py-1 ${windowDays === days ? "bg-slate-200 font-medium text-slate-800" : "hover:bg-slate-100"}`}
            >
              {days} ימים
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <span>לקוח:</span>
          <Link href={query({ client: "all" })} className={`rounded px-2 py-1 ${clientFilter === "all" ? "bg-slate-200 font-medium text-slate-800" : "hover:bg-slate-100"}`}>
            הכל
          </Link>
          {clients.map((client) => (
            <Link
              key={client.id}
              href={query({ client: client.id })}
              className={`rounded px-2 py-1 ${clientFilter === client.id ? "bg-slate-200 font-medium text-slate-800" : "hover:bg-slate-100"}`}
            >
              {client.name}
            </Link>
          ))}
        </div>

        {actionFilter !== "all" && (
          <Link href={query({ action: "all" })} className="badge badge-suspect">
            מסונן: {ACTION_LABELS_HE[actionFilter]} ✕
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card text-sm text-slate-500">
          {rows.length === 0
            ? "אין עדיין קמפיינים מסונכרנים. חברו חשבון Meta Ads ללקוח ולחצו «סנכרן עכשיו»."
            : "אין קמפיינים בסינון הזה."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <CampaignRow key={row.campaign.id} row={row} windowDays={windowDays} />
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">ספי אבחון</h2>
        <p className="text-sm text-slate-500">
          קמפיין לידים ב-B2B נכשל במספרים אחרים מקמפיין איקומרס. הספים הגלובליים חלים על כולם; לכל לקוח אפשר לדרוס רק את
          מה שבאמת שונה אצלו.
        </p>
        <ThresholdsEditor clientId="" clientName="גלובלי" effective={resolveThresholds(globalThresholdRow, null)} />
        {clients.map((client) => (
          <ThresholdsEditor
            key={client.id}
            clientId={client.id}
            clientName={client.name}
            effective={resolveThresholds(globalThresholdRow, thresholds.find((row) => row.client_id === client.id) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

function CampaignRow({ row, windowDays }: { row: CampaignDiagnosis; windowDays: number }) {
  const { campaign, clientName, result, thresholds } = row;
  const activity = campaignActivity(campaign.status);
  const hasVideo = result.metrics.impressions > 0 && (result.metrics.hookRate ?? 0) > 0;

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/ad-analysis/${campaign.id}?window=${windowDays}`} className="font-semibold hover:underline">
            {campaign.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Link href={`/clients/${campaign.client_id}`} className="hover:underline">
              {clientName}
            </Link>
            <span className={activity === "active" ? "badge badge-winner" : "badge badge-insufficient"}>{formatCampaignStatus(campaign.status)}</span>
            {result.status === "bottleneck_found" && result.primaryBottleneck && <ActionBadge action={result.primaryBottleneck} prefix="קודם כל:" />}
            {result.status === "healthy" && <span className="badge badge-winner">כל השלבים תקינים</span>}
            {result.status === "insufficient_data" && <span className="badge badge-insufficient">אין מספיק דאטה</span>}
          </div>
        </div>

        <div className="flex gap-4 text-xs text-slate-500">
          <div>
            <div>הוצאה</div>
            <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(result.metrics.spend)}</div>
          </div>
          <div>
            <div>המרות</div>
            <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatNumber(result.metrics.conversions)}</div>
          </div>
          <div>
            <div>CPA</div>
            <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(result.metrics.cpa)}</div>
          </div>
        </div>
      </div>

      <div className="mb-2">
        <FunnelStrip result={result} thresholds={thresholds} hasVideo={hasVideo} />
      </div>

      {result.insufficientReasonHe && <p className="text-sm text-slate-500">{result.insufficientReasonHe}</p>}

      {result.diagnoses.length > 0 && (
        <>
          <DiagnosisCard diagnosis={result.diagnoses[0]} isPrimary />
          {result.diagnoses.length > 1 && (
            <Link href={`/ad-analysis/${campaign.id}?window=${windowDays}`} className="mt-2 inline-block text-xs text-blue-700 hover:underline">
              עוד {result.diagnoses.length - 1} ממצאים במקביל · לניתוח מלא ופירוט לפי מודעה ←
            </Link>
          )}
        </>
      )}
    </div>
  );
}
