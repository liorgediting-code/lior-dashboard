import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { deriveStats, sumTotals, type CampaignStats } from "@/lib/metrics/campaign-stats";

export type StatsRow = {
  key: string;
  label: string;
  /** Optional second line under the label — funnel stage, status, etc. */
  sublabel?: string;
  stats: CampaignStats;
};

/**
 * The optimisation table: one row per campaign (or per adset/ad), with the
 * numbers you actually act on. Rendered identically on the funnel dashboard,
 * the campaigns tab and the client report so the same campaign never shows
 * two different CPLs in two places.
 *
 * "חשיפות" is impressions — ad_metrics_daily has no video-view column
 * (see lib/metrics/campaign-stats.ts).
 */
export function CampaignStatsTable({
  rows,
  totalLabel = "סה״כ",
  entityLabel = "קמפיין",
  emptyLabel = "אין קמפיינים משויכים.",
}: {
  rows: StatsRow[];
  totalLabel?: string;
  /** Header of the first column — the table also renders adsets and ads. */
  entityLabel?: string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  // Totals are re-derived from summed counters, not averaged from the rows —
  // the mean of per-campaign CPLs is not the blended CPL.
  const totalStats = deriveStats(sumTotals(rows.map((row) => row.stats)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-right text-slate-500">
            <th className="pb-1 font-normal">{entityLabel}</th>
            <th className="pb-1 font-normal">הוצאה</th>
            <th className="pb-1 font-normal">לידים</th>
            <th className="pb-1 font-normal">CPL</th>
            <th className="pb-1 font-normal">קליקים</th>
            <th className="pb-1 font-normal">חשיפות</th>
            <th className="pb-1 font-normal">CTR</th>
            <th className="pb-1 font-normal">CPC</th>
            <th className="pb-1 font-normal">CPM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-1.5">
                <span className="font-medium">{row.label}</span>
                {row.sublabel && <span className="block text-xs text-slate-400">{row.sublabel}</span>}
              </td>
              <td className="py-1.5">{formatCurrency(row.stats.spend)}</td>
              <td className="py-1.5">{formatNumber(row.stats.leads)}</td>
              <td className="py-1.5">{formatCurrency(row.stats.cpl)}</td>
              <td className="py-1.5">{formatNumber(row.stats.clicks)}</td>
              <td className="py-1.5">{formatNumber(row.stats.impressions)}</td>
              <td className="py-1.5">{formatPercent(row.stats.ctr)}</td>
              <td className="py-1.5">{formatCurrency(row.stats.cpc)}</td>
              <td className="py-1.5">{formatCurrency(row.stats.cpm)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-medium">
              <td className="py-1.5">{totalLabel}</td>
              <td className="py-1.5">{formatCurrency(totalStats.spend)}</td>
              <td className="py-1.5">{formatNumber(totalStats.leads)}</td>
              <td className="py-1.5">{formatCurrency(totalStats.cpl)}</td>
              <td className="py-1.5">{formatNumber(totalStats.clicks)}</td>
              <td className="py-1.5">{formatNumber(totalStats.impressions)}</td>
              <td className="py-1.5">{formatPercent(totalStats.ctr)}</td>
              <td className="py-1.5">{formatCurrency(totalStats.cpc)}</td>
              <td className="py-1.5">{formatCurrency(totalStats.cpm)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
