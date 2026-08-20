import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgencyCrmTable } from "@/components/agency-crm-table";
import { CampaignCrmDashboard } from "@/components/campaign-crm-dashboard";
import { CRM_CAMPAIGN_WINDOW_DAYS, fetchCrmCampaignDashboard } from "@/lib/metrics/crm-campaigns";
import { createAgencyLeadFromForm } from "@/lib/actions/agency-leads";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { AgencyLead } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["new", "contacted", "meeting", "proposal"];

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default async function AgencyCrmPage() {
  const supabase = supabaseAdmin();
  const [{ data }, pinnedCampaigns] = await Promise.all([
    supabase.from("agency_leads").select("*").order("created_at", { ascending: false }),
    fetchCrmCampaignDashboard(supabase, "agency"),
  ]);
  const leads = (data ?? []) as AgencyLead[];

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = monthStartIso();

  const open = leads.filter((lead) => OPEN_STATUSES.includes(lead.status));
  // Recomputed on every render, so the month rolls over on its own — no cron.
  const wonThisMonth = leads.filter((lead) => lead.status === "won" && lead.closed_at != null && lead.closed_at.slice(0, 10) >= monthStart);
  const wonValue = wonThisMonth.reduce((sum, lead) => sum + Number(lead.deal_value ?? 0), 0);
  const overdue = open.filter((lead) => lead.follow_up_at != null && lead.follow_up_at <= today);
  const pipelineValue = open.reduce((sum, lead) => sum + Number(lead.deal_value ?? 0), 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">CRM של הסוכנות</h1>
      <p className="mb-6 text-sm text-slate-500">הלידים והפרוספקטים של LiorEdits עצמה — נפרד לגמרי מה-CRM של כל לקוח.</p>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="לידים פתוחים" value={formatNumber(open.length)} />
        <StatCard label="שווי פייפליין פתוח" value={formatCurrency(pipelineValue)} />
        <StatCard label="עסקאות שנסגרו החודש" value={formatNumber(wonThisMonth.length)} />
        <StatCard label="הכנסה מעסקאות החודש" value={formatCurrency(wonValue)} />
      </div>

      <CampaignCrmDashboard
        campaigns={pinnedCampaigns}
        windowDays={CRM_CAMPAIGN_WINDOW_DAYS}
        showClientColumn
        manageHref="/campaigns"
      />

      {overdue.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          יש {overdue.length} לידים עם מעקב שעבר תאריכו — סנן לפי &quot;לפי תאריך מעקב&quot; כדי לטפל בהם.
        </div>
      )}

      <form action={createAgencyLeadFromForm} className="card mb-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input className="input" name="name" placeholder="שם הליד *" required />
          <input className="input" name="business_name" placeholder="שם העסק" />
          <input className="input" name="phone" placeholder="טלפון" />
          <input className="input" name="email" type="email" placeholder="מייל" />
          <input className="input" name="source" placeholder="מקור (המלצה, אינסטגרם…)" />
          <select className="input" name="status" defaultValue="new">
            <option value="new">חדש</option>
            <option value="contacted">יצרנו קשר</option>
            <option value="meeting">פגישה</option>
            <option value="proposal">הצעת מחיר</option>
            <option value="won">נסגר ✅</option>
            <option value="lost">לא רלוונטי</option>
          </select>
          <input className="input" name="deal_value" type="number" step="any" min="0" placeholder="שווי עסקה (₪)" />
          <input className="input" name="follow_up_at" type="date" title="תאריך מעקב" />
        </div>
        <textarea className="input" name="notes" rows={2} placeholder="הערות (אופציונלי)" />
        <button type="submit" className="btn btn-primary">
          + הוסף ליד
        </button>
      </form>

      <AgencyCrmTable leads={leads} />
    </div>
  );
}
