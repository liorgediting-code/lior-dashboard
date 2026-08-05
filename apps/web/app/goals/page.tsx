import { supabaseAdmin } from "@/lib/supabase/admin";
import { setGoalFromForm } from "@/lib/actions/goals";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Goal, GoalMetric } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const METRIC_LABEL: Record<GoalMetric, string> = {
  client_count: "כמות לקוחות",
  revenue: "הכנסה החודש (₪)",
  leads_count: "כמות לידים החודש",
};

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function GoalCard({ metric, actual, target, formatValue }: { metric: GoalMetric; actual: number; target: number | null; formatValue: (n: number) => string }) {
  const pct = target && target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;

  return (
    <div className="card">
      <p className="text-sm text-slate-500">{METRIC_LABEL[metric]}</p>
      <p className="mb-2 text-2xl font-bold">
        {formatValue(actual)} {target != null && <span className="text-base font-normal text-slate-400">/ {formatValue(target)}</span>}
      </p>
      {pct != null && (
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
      )}
      <form action={setGoalFromForm.bind(null, metric)} className="flex gap-2">
        <input className="input" name="target_value" type="number" step="any" min="0" placeholder="קבע יעד" defaultValue={target ?? ""} />
        <button type="submit" className="btn btn-secondary text-xs">
          שמור
        </button>
      </form>
    </div>
  );
}

export default async function GoalsPage() {
  const supabase = supabaseAdmin();
  const monthStart = monthStartIso();

  const [{ data: goals }, { data: clients }, { data: payments }, { data: leads }] = await Promise.all([
    supabase.from("goals").select("*"),
    supabase.from("clients").select("id"),
    supabase.from("client_payments").select("amount").gte("paid_on", monthStart),
    supabase.from("leads").select("id").gte("created_at", monthStart),
  ]);

  const goalByMetric = new Map(((goals ?? []) as Goal[]).map((g) => [g.metric, g.target_value]));
  const clientCount = (clients ?? []).length;
  const revenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const leadsCount = (leads ?? []).length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">מטרות</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GoalCard metric="client_count" actual={clientCount} target={goalByMetric.get("client_count") ?? null} formatValue={formatNumber} />
        <GoalCard metric="revenue" actual={revenue} target={goalByMetric.get("revenue") ?? null} formatValue={formatCurrency} />
        <GoalCard metric="leads_count" actual={leadsCount} target={goalByMetric.get("leads_count") ?? null} formatValue={formatNumber} />
      </div>
      <p className="mt-4 text-sm text-slate-500">
        הכנסה וכמות לידים מחושבים לפי החודש הנוכחי. כמות לקוחות היא הכמות הכוללת כרגע. הכנסה מחושבת מהתשלומים שנרשמים בעריכת כל לקוח.
      </p>
    </div>
  );
}
