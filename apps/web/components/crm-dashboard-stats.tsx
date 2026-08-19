import type { Lead, LeadStatus } from "@dashboard-lior/shared";

export function CrmDashboardStats({ leads, statuses }: { leads: Lead[]; statuses: LeadStatus[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const openStatusIds = new Set(statuses.filter((s) => s.kind === "open").map((s) => s.id));
  const wonStatusIds = new Set(statuses.filter((s) => s.kind === "won").map((s) => s.id));
  const wonCount = leads.filter((l) => wonStatusIds.has(l.status_id)).length;
  const dealsThisMonth = leads.filter((l) => wonStatusIds.has(l.status_id) && l.closed_at && l.closed_at.slice(0, 10) >= monthStartIso).length;
  const newThisWeek = leads.filter((l) => l.created_at.slice(0, 10) >= weekAgoIso).length;
  const overdueFollowUps = leads.filter((l) => openStatusIds.has(l.status_id) && l.follow_up_at && l.follow_up_at < todayIso).length;
  const openCount = leads.filter((l) => openStatusIds.has(l.status_id)).length;

  const cards = [
    { label: "סה״כ לידים", value: leads.length },
    { label: "פתוחים כרגע", value: openCount },
    { label: "חדשים השבוע", value: newThisWeek },
    { label: "עסקאות החודש", value: dealsThisMonth },
    { label: "נסגרו בהצלחה (סה״כ)", value: wonCount },
  ];

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
      {overdueFollowUps > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          יש {overdueFollowUps} לידים עם מעקב שעבר תאריך ועדיין לא טופלו — סנן לפי &quot;לפי תאריך מעקב&quot; כדי לטפל בהם.
        </div>
      )}
    </div>
  );
}
