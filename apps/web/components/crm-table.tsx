"use client";

import { Fragment, useMemo, useState } from "react";
import type { Lead, LeadStatus, LeadColumn, LeadActivity } from "@dashboard-lior/shared";
import { updateLeadField, updateLeadStatus, deleteLead, createLeadFromForm } from "@/lib/actions/leads";
import { LeadActivityPanel } from "@/components/lead-activity-panel";

type SortOption = "created_desc" | "follow_up_asc";

const KIND_BADGE_CLASS: Record<LeadStatus["kind"], string> = {
  open: "badge-insufficient",
  won: "badge-winner",
  lost: "badge-kill",
};

function EditableCell({
  value,
  onSave,
  type = "text",
}: {
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "number" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="block w-full rounded px-1 py-0.5 text-right hover:bg-slate-50"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || "—"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="input"
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

export function CrmTable({
  clientId,
  leads,
  statuses,
  columns,
  sourceLabels = {},
  activitiesByLeadId = {},
}: {
  clientId: string;
  leads: Lead[];
  statuses: LeadStatus[];
  columns: LeadColumn[];
  sourceLabels?: Record<string, string>;
  activitiesByLeadId?: Record<string, LeadActivity[]>;
}) {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const todayIso = new Date().toISOString().slice(0, 10);

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("created_desc");

  const sourceOptions = useMemo(() => {
    const labels = new Set(Object.values(sourceLabels));
    return [...labels].sort();
  }, [sourceLabels]);

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    let rows = leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status_id !== statusFilter) return false;
      const sourceLabel = lead.source_ad_id ? (sourceLabels[lead.source_ad_id] ?? "מודעה לא מזוהה") : "ידני";
      if (sourceFilter !== "all" && sourceLabel !== sourceFilter) return false;
      if (query) {
        const haystack = `${lead.name ?? ""} ${lead.phone ?? ""} ${lead.email ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    if (sortBy === "follow_up_asc") {
      rows = [...rows].sort((a, b) => (a.follow_up_at ?? "9999-99-99").localeCompare(b.follow_up_at ?? "9999-99-99"));
    }
    return rows;
  }, [leads, search, statusFilter, sourceFilter, sortBy, sourceLabels]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="חיפוש לפי שם / טלפון / אימייל" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          {sortedStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {sourceOptions.length > 0 && (
          <select className="input w-40" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="all">כל המקורות</option>
            <option value="ידני">ידני</option>
            {sourceOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}
        <select className="input w-44" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
          <option value="created_desc">חדשים קודם</option>
          <option value="follow_up_asc">מעקב קרוב קודם</option>
        </select>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500">
            <th className="p-2 font-normal">שם</th>
            <th className="p-2 font-normal">טלפון</th>
            <th className="p-2 font-normal">אימייל</th>
            <th className="p-2 font-normal">סטטוס</th>
            <th className="p-2 font-normal">מקור</th>
            <th className="p-2 font-normal">שווי עסקה</th>
            <th className="p-2 font-normal">מעקב הבא</th>
            {sortedColumns.map((col) => (
              <th key={col.id} className="p-2 font-normal">
                {col.name}
              </th>
            ))}
            <th className="p-2 font-normal" />
            <th className="p-2 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleLeads.length === 0 && (
            <tr>
              <td colSpan={9 + sortedColumns.length} className="p-4 text-center text-slate-500">
                אין לידים תואמים לסינון.
              </td>
            </tr>
          )}
          {visibleLeads.map((lead) => {
            const status = sortedStatuses.find((s) => s.id === lead.status_id);
            const isOverdue = status?.kind === "open" && !!lead.follow_up_at && lead.follow_up_at < todayIso;
            const isExpanded = expandedLeadId === lead.id;
            return (
              <Fragment key={lead.id}>
              <tr className={isOverdue ? "bg-red-50" : undefined}>
                <td className="p-1">
                  <EditableCell value={lead.name ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "name", v)} />
                </td>
                <td className="p-1">
                  <EditableCell value={lead.phone ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "phone", v)} />
                </td>
                <td className="p-1">
                  <EditableCell value={lead.email ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "email", v)} />
                </td>
                <td className="p-1">
                  <select
                    className={`badge ${KIND_BADGE_CLASS[status?.kind ?? "open"]}`}
                    value={lead.status_id}
                    onChange={(e) => updateLeadStatus(lead.id, clientId, e.target.value)}
                  >
                    {sortedStatuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1 text-xs text-slate-500" title={lead.source_ad_id ? sourceLabels[lead.source_ad_id] : undefined}>
                  {lead.source_ad_id ? (sourceLabels[lead.source_ad_id] ?? "מודעה לא מזוהה") : "ידני"}
                </td>
                <td className="p-1">
                  <EditableCell
                    value={String(lead.deal_value ?? "")}
                    type="number"
                    onSave={(v) => updateLeadField(lead.id, clientId, "deal_value", v)}
                  />
                </td>
                <td className={`p-1 ${isOverdue ? "font-medium text-red-700" : ""}`}>
                  <EditableCell
                    value={lead.follow_up_at ?? ""}
                    type="date"
                    onSave={(v) => updateLeadField(lead.id, clientId, "follow_up_at", v)}
                  />
                </td>
                {sortedColumns.map((col) => (
                  <td key={col.id} className="p-1">
                    <EditableCell
                      value={String(lead.custom_fields[col.id] ?? "")}
                      type={col.type === "number" ? "number" : "text"}
                      onSave={(v) => updateLeadField(lead.id, clientId, `custom:${col.id}`, v)}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
                  >
                    {isExpanded ? "סגור" : "פעילות"}
                  </button>
                </td>
                <td className="p-1">
                  <button type="button" className="btn btn-secondary text-xs" onClick={() => deleteLead(lead.id, clientId)}>
                    ✕
                  </button>
                </td>
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={9 + sortedColumns.length} className="p-2">
                    <LeadActivityPanel leadId={lead.id} clientId={clientId} activities={activitiesByLeadId[lead.id] ?? []} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <form action={createLeadFromForm.bind(null, clientId)} className="mt-4 flex flex-wrap gap-2">
        <input className="input flex-1" name="name" placeholder="שם" />
        <input className="input flex-1" name="phone" placeholder="טלפון" />
        <input className="input flex-1" name="email" placeholder="אימייל" />
        <button type="submit" className="btn btn-primary">
          + ליד חדש
        </button>
      </form>
      </div>
    </div>
  );
}
