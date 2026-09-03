"use client";

import { useState } from "react";
import type { AgencyLeadStatus } from "@dashboard-lior/shared";
import { renameAgencyLeadStatus } from "@/lib/actions/agency-leads";

const STATUS_ORDER: AgencyLeadStatus[] = ["new", "contacted", "meeting", "proposal", "won", "lost"];

/** kind !== "open" statuses can't be removed — the fixed pipeline needs both a closed-won and closed-lost step — but the label shown for any of them is always renamable. */
const LOCKED_STATUSES: AgencyLeadStatus[] = ["won", "lost"];

function EditableLabel({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded px-1 py-0.5 text-right hover:bg-slate-50"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() && draft !== value) onSave(draft.trim());
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

export function AgencyStatusLabelsPanel({ statusLabels }: { statusLabels: Record<AgencyLeadStatus, string> }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary mb-4" onClick={() => setOpen(true)}>
        ⚙ ניהול שמות סטטוסים
      </button>
    );
  }

  return (
    <div className="card mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ניהול שמות סטטוסים</h2>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => setOpen(false)}>
          סגור
        </button>
      </div>
      <p className="text-xs text-slate-500">
        הסטטוסים עצמם קבועים (לא ניתן להוסיף/למחוק), אבל אפשר להתאים את השם שמוצג לכל אחד מהם.
      </p>
      <div className="space-y-1">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="flex items-center gap-2 text-sm">
            <span className="flex flex-1 items-center">
              <EditableLabel value={statusLabels[status]} onSave={(label) => renameAgencyLeadStatus(status, label)} />
              {LOCKED_STATUSES.includes(status) && <span className="text-xs text-slate-400"> (קבוע)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
