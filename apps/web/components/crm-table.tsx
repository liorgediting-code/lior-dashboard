"use client";

import { useState } from "react";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";
import { updateLeadField, updateLeadStatus, deleteLead, createLeadFromForm } from "@/lib/actions/leads";

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
  type?: "text" | "number";
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
}: {
  clientId: string;
  leads: Lead[];
  statuses: LeadStatus[];
  columns: LeadColumn[];
}) {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500">
            <th className="p-2 font-normal">שם</th>
            <th className="p-2 font-normal">טלפון</th>
            <th className="p-2 font-normal">אימייל</th>
            <th className="p-2 font-normal">סטטוס</th>
            <th className="p-2 font-normal">שווי עסקה</th>
            {sortedColumns.map((col) => (
              <th key={col.id} className="p-2 font-normal">
                {col.name}
              </th>
            ))}
            <th className="p-2 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => {
            const status = sortedStatuses.find((s) => s.id === lead.status_id);
            return (
              <tr key={lead.id}>
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
                <td className="p-1">
                  <EditableCell
                    value={String(lead.deal_value ?? "")}
                    type="number"
                    onSave={(v) => updateLeadField(lead.id, clientId, "deal_value", v)}
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
  );
}
