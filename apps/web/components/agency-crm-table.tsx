"use client";

import { useMemo, useState } from "react";
import type { AgencyLead, AgencyLeadStatus } from "@dashboard-lior/shared";
import { updateAgencyLeadField, updateAgencyLeadStatus, deleteAgencyLead } from "@/lib/actions/agency-leads";

export const AGENCY_STATUS_LABEL: Record<AgencyLeadStatus, string> = {
  new: "חדש",
  contacted: "יצרנו קשר",
  meeting: "פגישה",
  proposal: "הצעת מחיר",
  won: "נסגר ✅",
  lost: "לא רלוונטי",
};

const STATUS_BADGE_CLASS: Record<AgencyLeadStatus, string> = {
  new: "badge-neutral",
  contacted: "badge-neutral",
  meeting: "badge-insufficient",
  proposal: "badge-insufficient",
  won: "badge-winner",
  lost: "badge-kill",
};

const STATUS_ORDER: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal", "won", "lost"];

/** won/lost are terminal — an overdue follow-up on them isn't actionable. */
const OPEN_STATUSES: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal"];

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

export function AgencyCrmTable({ leads }: { leads: AgencyLead[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgencyLeadStatus | "all" | "open">("all");
  const [sort, setSort] = useState<SortOption>("created_desc");

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
              {AGENCY_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select className="input sm:max-w-[12rem]" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
          <option value="created_desc">חדשים קודם</option>
          <option value="follow_up_asc">לפי תאריך מעקב</option>
          <option value="deal_value_desc">לפי שווי עסקה</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-right text-xs text-slate-500">
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

              return (
                <tr key={lead.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-3 py-2 font-medium">
                    <EditableCell value={lead.name} onSave={(v) => updateAgencyLeadField(lead.id, "name", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={lead.business_name ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "business_name", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={lead.phone ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "phone", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={lead.email ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "email", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={lead.source ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "source", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={`badge ${STATUS_BADGE_CLASS[lead.status]} cursor-pointer border-0`}
                      value={lead.status}
                      onChange={(e) => updateAgencyLeadStatus(lead.id, e.target.value as AgencyLeadStatus)}
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {AGENCY_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell type="number" value={lead.deal_value != null ? String(lead.deal_value) : ""} onSave={(v) => updateAgencyLeadField(lead.id, "deal_value", v)} />
                  </td>
                  <td className={`px-3 py-2 ${overdue ? "font-semibold text-red-600" : ""}`}>
                    <EditableCell type="date" value={lead.follow_up_at ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "follow_up_at", v)} />
                  </td>
                  <td className="max-w-[16rem] px-3 py-2 text-slate-600">
                    <EditableCell value={lead.notes ?? ""} onSave={(v) => updateAgencyLeadField(lead.id, "notes", v)} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-600"
                      onClick={() => {
                        if (confirm(`למחוק את הליד "${lead.name}"?`)) deleteAgencyLead(lead.id);
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
    </div>
  );
}
