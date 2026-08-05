import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { SopBottleneck } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardHomePage() {
  const supabase = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = todayIso();

  const { data: wonStatuses } = await supabase.from("lead_statuses").select("id").eq("kind", "won");
  const wonStatusIds = (wonStatuses ?? []).map((s) => s.id as string);

  const [{ data: bottlenecks }, { data: clients }, { data: metrics }, { data: wonLeads }, { data: dailyTasks }] = await Promise.all([
    supabase.from("sop_bottlenecks").select("*").order("days_stuck", { ascending: false }),
    supabase.from("clients").select("id"),
    supabase.from("ad_metrics_daily").select("spend").gte("date", since),
    wonStatusIds.length
      ? supabase.from("leads").select("deal_value").in("status_id", wonStatusIds).gte("created_at", since)
      : Promise.resolve({ data: [] as { deal_value: number | null }[] }),
    supabase.from("daily_tasks").select("id").eq("active", true),
  ]);

  const totalSpend = (metrics ?? []).reduce((sum, m) => sum + Number(m.spend), 0);
  const totalRevenue = (wonLeads ?? []).reduce((sum, l) => sum + Number(l.deal_value ?? 0), 0);
  const avgRoi = totalSpend > 0 ? totalRevenue / totalSpend : null;

  const dailyTaskIds = (dailyTasks ?? []).map((t) => t.id as string);
  const { data: completionsToday } = dailyTaskIds.length
    ? await supabase.from("daily_task_completions").select("daily_task_id").in("daily_task_id", dailyTaskIds).eq("completed_on", today)
    : { data: [] as { daily_task_id: string }[] };
  const dailyCompletionPct =
    dailyTaskIds.length > 0 ? Math.round(((completionsToday ?? []).length / dailyTaskIds.length) * 100) : null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">דשבורד</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card">
          <p className="text-sm text-slate-500">סה&quot;כ Ad Spend בניהול (30 יום)</p>
          <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">לקוחות פעילים</p>
          <p className="text-2xl font-bold">{formatNumber((clients ?? []).length)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">ROI ממוצע (30 יום)</p>
          <p className="text-2xl font-bold">{avgRoi != null ? `${avgRoi.toFixed(1)}x` : "—"}</p>
        </div>
        <Link href="/missions/business" className="card hover:border-slate-400">
          <p className="text-sm text-slate-500">עקביות יומית — משימות לעסק</p>
          <p className="text-2xl font-bold">{dailyCompletionPct != null ? `${dailyCompletionPct}%` : "—"}</p>
        </Link>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">צווארי בקבוק — לקוחות תקועים</h2>
        <div className="space-y-2">
          {((bottlenecks ?? []) as SopBottleneck[])
            .filter((b) => b.gate_status === "pending")
            .map((b) => (
              <Link
                key={b.client_id}
                href={`/clients/${b.client_id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:border-slate-400"
              >
                <span className="font-medium">{b.name}</span>
                <span className="text-sm text-slate-500">
                  שלב {b.sop_stage} · Gate {b.gate_number} · תקוע {b.days_stuck} ימים
                </span>
              </Link>
            ))}
          {((bottlenecks ?? []) as SopBottleneck[]).filter((b) => b.gate_status === "pending").length === 0 && (
            <p className="text-slate-500">אין צווארי בקבוק כרגע 🎉</p>
          )}
        </div>
      </div>
    </div>
  );
}
