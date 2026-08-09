"use client";

import type { Lead, LeadStatus } from "@dashboard-lior/shared";
import { updateLeadField } from "@/lib/actions/leads";

function ReminderRow({ lead, clientId, overdue }: { lead: Lead; clientId: string; overdue: boolean }) {
  return (
    <div className={`card flex flex-wrap items-center justify-between gap-2 ${overdue ? "border-red-200 bg-red-50" : ""}`}>
      <div>
        <p className="font-medium">{lead.name || "ליד ללא שם"}</p>
        <p className="text-sm text-slate-500">
          {lead.phone || "—"} · מעקב ל־{lead.follow_up_at}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="input w-40"
          type="date"
          defaultValue={lead.follow_up_at ?? ""}
          onChange={(e) => updateLeadField(lead.id, clientId, "follow_up_at", e.target.value)}
        />
        <button type="button" className="btn btn-secondary text-sm" onClick={() => updateLeadField(lead.id, clientId, "follow_up_at", "")}>
          טופל ✓
        </button>
      </div>
    </div>
  );
}

export function FollowUpReminders({ leads, statuses, clientId }: { leads: Lead[]; statuses: LeadStatus[]; clientId: string }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const openStatusIds = new Set(statuses.filter((s) => s.kind === "open").map((s) => s.id));

  const due = leads.filter((l) => openStatusIds.has(l.status_id) && l.follow_up_at && l.follow_up_at <= todayIso);
  const overdue = due.filter((l) => l.follow_up_at! < todayIso);
  const today = due.filter((l) => l.follow_up_at === todayIso);

  if (due.length === 0) {
    return <p className="text-slate-500">אין תזכורות מעקב פתוחות להיום. 🎉</p>;
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-red-700">באיחור ({overdue.length})</h2>
          {overdue.map((lead) => (
            <ReminderRow key={lead.id} lead={lead} clientId={clientId} overdue />
          ))}
        </div>
      )}
      {today.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">להיום ({today.length})</h2>
          {today.map((lead) => (
            <ReminderRow key={lead.id} lead={lead} clientId={clientId} overdue={false} />
          ))}
        </div>
      )}
    </div>
  );
}
