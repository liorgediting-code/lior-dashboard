"use client";

import { useMemo, useState } from "react";
import type { Lead, LeadStatus, LeadColumn, LeadActivity } from "@dashboard-lior/shared";
import { updateLeadField, updateLeadStatus, deleteLead, createLeadFromForm } from "@/lib/actions/leads";
import { LeadActivityPanel } from "@/components/lead-activity-panel";
import type { ResolvedColumn } from "@/lib/crm/column-layout";

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

function LeadProfilePanel({
  lead,
  clientId,
  statuses,
  columns,
  columnById,
  sourceLabel,
  activities,
  onClose,
}: {
  lead: Lead;
  clientId: string;
  statuses: LeadStatus[];
  columns: LeadColumn[];
  columnById: Map<string, LeadColumn>;
  sourceLabel: string;
  activities: LeadActivity[];
  onClose: () => void;
}) {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const status = sortedStatuses.find((s) => s.id === lead.status_id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="animate-in relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{lead.name || "ליד ללא שם"}</h2>
          <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>
            ✕ סגור
          </button>
        </div>

        <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3">
          <div>
            <p className="label">שם</p>
            <EditableCell value={lead.name ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "name", v)} />
          </div>
          <div>
            <p className="label">טלפון</p>
            <EditableCell value={lead.phone ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "phone", v)} />
          </div>
          <div>
            <p className="label">אימייל</p>
            <EditableCell value={lead.email ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "email", v)} />
          </div>
          <div>
            <p className="label">סטטוס</p>
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
          </div>
          <div>
            <p className="label">מקור</p>
            <p className="text-sm text-slate-700">{sourceLabel}</p>
          </div>
          <div>
            <p className="label">שווי עסקה</p>
            <EditableCell
              value={String(lead.deal_value ?? "")}
              type="number"
              onSave={(v) => updateLeadField(lead.id, clientId, "deal_value", v)}
            />
          </div>
          <div>
            <p className="label">תאריך מעקב</p>
            <EditableCell
              value={lead.follow_up_at ?? ""}
              type="date"
              onSave={(v) => updateLeadField(lead.id, clientId, "follow_up_at", v)}
            />
          </div>
          {columns.map((col) => (
            <div key={col.id}>
              <p className="label">{col.name}</p>
              <EditableCell
                value={String(lead.custom_fields[col.id] ?? "")}
                type={col.type === "number" ? "number" : "text"}
                onSave={(v) => updateLeadField(lead.id, clientId, `custom:${col.id}`, v)}
              />
            </div>
          ))}
          <p className="text-xs text-slate-400">
            נוצר ב־{new Date(lead.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>

        <LeadActivityPanel leadId={lead.id} clientId={clientId} activities={activities} />

        <button
          type="button"
          className="btn btn-danger mt-4 text-xs"
          onClick={() => {
            deleteLead(lead.id, clientId);
            onClose();
          }}
        >
          ✕ מחיקת ליד
        </button>
      </div>
    </div>
  );
}

export function CrmTable({
  clientId,
  leads,
  statuses,
  columns,
  columnLayout,
  sourceLabels = {},
  activitiesByLeadId = {},
}: {
  clientId: string;
  leads: Lead[];
  statuses: LeadStatus[];
  columns: LeadColumn[];
  /** Resolved order + visibility of built-in and custom columns together — see lib/crm/column-layout.ts. */
  columnLayout: ResolvedColumn[];
  sourceLabels?: Record<string, string>;
  activitiesByLeadId?: Record<string, LeadActivity[]>;
}) {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const columnById = new Map(columns.map((col) => [col.id, col]));
  const visibleColumns = columnLayout.filter((col) => !col.hidden);
  const todayIso = new Date().toISOString().slice(0, 10);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
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

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

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
            {visibleColumns.map((col) => (
              <th key={col.key} className="p-2 font-normal">
                {col.label}
              </th>
            ))}
            <th className="p-2 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleLeads.length === 0 && (
            <tr>
              <td colSpan={1 + visibleColumns.length} className="p-4 text-center text-slate-500">
                אין לידים תואמים לסינון.
              </td>
            </tr>
          )}
          {visibleLeads.map((lead) => {
            const status = sortedStatuses.find((s) => s.id === lead.status_id);
            const isOverdue = status?.kind === "open" && !!lead.follow_up_at && lead.follow_up_at < todayIso;
            return (
              <tr
                key={lead.id}
                className={`cursor-pointer hover:bg-slate-50 ${isOverdue ? "bg-red-50" : ""}`}
                onClick={() => setSelectedLeadId(lead.id)}
              >
                {visibleColumns.map((col) => {
                  switch (col.key) {
                    case "name":
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
                          <EditableCell value={lead.name ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "name", v)} />
                        </td>
                      );
                    case "phone":
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
                          <EditableCell value={lead.phone ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "phone", v)} />
                        </td>
                      );
                    case "email":
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
                          <EditableCell value={lead.email ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "email", v)} />
                        </td>
                      );
                    case "status":
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
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
                      );
                    case "source":
                      return (
                        <td key={col.key} className="p-1 text-xs text-slate-500" title={lead.source_ad_id ? sourceLabels[lead.source_ad_id] : undefined}>
                          {lead.source_ad_id ? (sourceLabels[lead.source_ad_id] ?? "מודעה לא מזוהה") : "ידני"}
                        </td>
                      );
                    case "deal_value":
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
                          <EditableCell
                            value={String(lead.deal_value ?? "")}
                            type="number"
                            onSave={(v) => updateLeadField(lead.id, clientId, "deal_value", v)}
                          />
                        </td>
                      );
                    case "follow_up":
                      return (
                        <td key={col.key} className={`p-1 ${isOverdue ? "font-medium text-red-700" : ""}`} onClick={(e) => e.stopPropagation()}>
                          <EditableCell
                            value={lead.follow_up_at ?? ""}
                            type="date"
                            onSave={(v) => updateLeadField(lead.id, clientId, "follow_up_at", v)}
                          />
                        </td>
                      );
                    default: {
                      const customColumn = columnById.get(col.key);
                      return (
                        <td key={col.key} className="p-1" onClick={(e) => e.stopPropagation()}>
                          <EditableCell
                            value={String(lead.custom_fields[col.key] ?? "")}
                            type={customColumn?.type === "number" ? "number" : "text"}
                            onSave={(v) => updateLeadField(lead.id, clientId, `custom:${col.key}`, v)}
                          />
                        </td>
                      );
                    }
                  }
                })}
                <td className="p-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-secondary text-xs" onClick={() => deleteLead(lead.id, clientId)}>
                    ✕
                  </button>
                </td>
              </tr>
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
      {selectedLead && (
        <LeadProfilePanel
          lead={selectedLead}
          clientId={clientId}
          statuses={statuses}
          columns={columns}
          columnById={columnById}
          sourceLabel={selectedLead.source_ad_id ? (sourceLabels[selectedLead.source_ad_id] ?? "מודעה לא מזוהה") : "ידני"}
          activities={activitiesByLeadId[selectedLead.id] ?? []}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}
