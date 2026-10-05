"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import type { AgencyLead, AgencyLeadStatus } from "@dashboard-lior/shared";
import { updateAgencyLeadField, updateAgencyLeadStatus, deleteAgencyLead } from "@/lib/actions/agency-leads";

const STATUS_BADGE_CLASS: Record<AgencyLeadStatus, string> = {
  new: "badge-blue",
  contacted: "badge-suspect",
  meeting: "badge-purple",
  proposal: "badge-teal",
  won: "badge-winner",
  lost: "badge-kill",
};

const STATUS_ORDER: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal", "won", "lost"];

/** won/lost are terminal — an overdue follow-up on them isn't actionable. */
const OPEN_STATUSES: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal"];

type StatusLabels = Record<AgencyLeadStatus, string>;

type SortOption = "created_desc" | "follow_up_asc" | "deal_value_desc";

function EditableCell({
  value,
  onSave,
  type = "text",
  placeholder,
}: {
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
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
        {value || <span className="text-slate-300">{placeholder ?? "—"}</span>}
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

function AgencyLeadProfilePanel({
  lead,
  statusLabels,
  onClose,
}: {
  lead: AgencyLead;
  statusLabels: StatusLabels;
  onClose: () => void;
}) {
  // Portaled to <body> — a fixed-position child of <main> (which carries the
  // permanent .animate-in transform) would be sized against main's full
  // scroll height instead of the viewport, pushing this footer off-screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="animate-in relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{lead.name || "ליד ללא שם"}</h2>
          <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>
            ✕ סגור
          </button>
        </div>

        <div className="mb-3 space-y-2 rounded-lg border border-slate-200 p-2">
          <div>
            <p className="label">שם</p>
            <EditableCell value={lead.name} onSave={(v) => updateAgencyLeadField(lead.id, "name", v)} />
          </div>
          <div>
            <p className="label">עסק</p>
            <EditableCell value={lead.business_name ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "business_name", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="label">טלפון</p>
              <EditableCell value={lead.phone ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "phone", v)} />
            </div>
            <div>
              <p className="label">אימייל</p>
              <EditableCell value={lead.email ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "email", v)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="label">סטטוס</p>
              <select
                className={`badge ${STATUS_BADGE_CLASS[lead.status]}`}
                value={lead.status}
                onChange={(e) => updateAgencyLeadStatus(lead.id, e.target.value as AgencyLeadStatus)}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="label">מקור</p>
              <EditableCell value={lead.source ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "source", v)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="label">שווי עסקה</p>
              <EditableCell
                value={lead.deal_value != null ? String(lead.deal_value) : ""}
                type="number"
                onSave={(v) => updateAgencyLeadField(lead.id, "deal_value", v)}
              />
            </div>
            <div>
              <p className="label">תאריך מעקב</p>
              <EditableCell value={lead.follow_up_at ?? ""} type="date" onSave={(v) => updateAgencyLeadField(lead.id, "follow_up_at", v)} />
            </div>
          </div>
          <div>
            <p className="label">הערות</p>
            <EditableCell value={lead.notes ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "notes", v)} />
          </div>
          <p className="text-xs text-slate-400">
            נוצר ב־{new Date(lead.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200 p-3">
        <button type="button" className="btn btn-primary w-full text-xs" onClick={onClose}>
          שמור שינויים
        </button>
        <button
          type="button"
          className="btn btn-danger mt-2 w-full text-xs"
          onClick={() => {
            if (confirm(`אתה בטוח שאתה רוצה למחוק את הליד "${lead.name}"?`)) {
              deleteAgencyLead(lead.id);
              onClose();
            }
          }}
        >
          ✕ מחיקת ליד
        </button>
      </div>
      </div>
    </div>,
    document.body
  );
}

export function AgencyCrmTable({ leads, statusLabels }: { leads: AgencyLead[]; statusLabels: StatusLabels }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgencyLeadStatus | "all" | "open">("all");
  const [sort, setSort] = useState<SortOption>("created_desc");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const filtered = leads.filter((lead) => {
      if (statusFilter === "open" && !OPEN_STATUSES.includes(lead.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && lead.status !== statusFilter) return false;
      if (!needle) return true;
      return [lead.name, lead.business_name, lead.phone, lead.email, lead.source, lead.notes]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    return [...filtered].sort((a, b) => {
      if (sort === "deal_value_desc") return (b.deal_value ?? 0) - (a.deal_value ?? 0);
      if (sort === "follow_up_asc") {
        // Leads with no follow-up date sink to the bottom instead of sorting first.
        if (!a.follow_up_at && !b.follow_up_at) return 0;
        if (!a.follow_up_at) return 1;
        if (!b.follow_up_at) return -1;
        return a.follow_up_at.localeCompare(b.follow_up_at);
      }
      return b.created_at.localeCompare(a.created_at);
    });
  }, [leads, search, statusFilter, sort]);

  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input sm:max-w-xs"
          placeholder="חיפוש לפי שם, עסק, טלפון, מייל…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input sm:max-w-[12rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AgencyLeadStatus | "all" | "open")}>
          <option value="all">כל הסטטוסים</option>
          <option value="open">פתוחים בלבד</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
        <select className="input sm:max-w-[12rem]" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
          <option value="created_desc">חדשים קודם</option>
          <option value="follow_up_asc">לפי תאריך מעקב</option>
          <option value="deal_value_desc">לפי שווי עסקה</option>
        </select>
      </div>

      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto border-y border-slate-200 bg-white">
        <table className="crm-grid w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-right text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">שם</th>
              <th className="px-3 py-2 font-medium">עסק</th>
              <th className="px-3 py-2 font-medium">טלפון</th>
              <th className="px-3 py-2 font-medium">מייל</th>
              <th className="px-3 py-2 font-medium">מקור</th>
              <th className="px-3 py-2 font-medium">סטטוס</th>
              <th className="px-3 py-2 font-medium">שווי (₪)</th>
              <th className="px-3 py-2 font-medium">מעקב</th>
              <th className="px-3 py-2 font-medium">הערות</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => {
              const overdue = lead.follow_up_at != null && lead.follow_up_at <= today && OPEN_STATUSES.includes(lead.status);
              const stopRowClick = (e: MouseEvent) => e.stopPropagation();

              return (
                <tr
                  key={lead.id}
                  className="cursor-pointer border-b border-slate-100 bg-white align-top last:border-0 hover:bg-slate-50"
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <td className="px-3 py-2 font-medium" onClick={stopRowClick}>
                    <EditableCell value={lead.name} onSave={(v) => updateAgencyLeadField(lead.id, "name", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <EditableCell value={lead.business_name ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "business_name", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <EditableCell value={lead.phone ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "phone", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <EditableCell value={lead.email ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "email", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <EditableCell value={lead.source ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "source", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <select
                      className={`badge ${STATUS_BADGE_CLASS[lead.status]} cursor-pointer border-0`}
                      value={lead.status}
                      onChange={(e) => updateAgencyLeadStatus(lead.id, e.target.value as AgencyLeadStatus)}
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <EditableCell type="number" value={lead.deal_value != null ? String(lead.deal_value) : ""} onSave={(v) => updateAgencyLeadField(lead.id, "deal_value", v)} />
                  </td>
                  <td className={`px-3 py-2 ${overdue ? "font-semibold text-red-600" : ""}`} onClick={stopRowClick}>
                    <EditableCell type="date" value={lead.follow_up_at ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "follow_up_at", v)} />
                  </td>
                  <td className="max-w-[16rem] px-3 py-2 text-slate-600" onClick={stopRowClick}>
                    <EditableCell value={lead.notes ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "notes", v)} />
                  </td>
                  <td className="px-3 py-2" onClick={stopRowClick}>
                    <button type="button" className="ml-2 text-xs text-slate-400 hover:text-slate-700" onClick={() => setSelectedLeadId(lead.id)}>
                      פרטים ›
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-600"
                      onClick={() => {
                        if (confirm(`אתה בטוח שאתה רוצה למחוק את הליד "${lead.name}"?`)) deleteAgencyLead(lead.id);
                      }}
                    >
                      מחק
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  {leads.length === 0 ? "אין עדיין לידים ב-CRM של הסוכנות." : "אין לידים שתואמים לסינון."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedLead && <AgencyLeadProfilePanel lead={selectedLead} statusLabels={statusLabels} onClose={() => setSelectedLeadId(null)} />}
    </div>
  );
}
