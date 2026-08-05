"use client";

import { useState } from "react";
import type { LeadStatus, LeadColumn, LeadColumnType } from "@dashboard-lior/shared";
import { createLeadStatus, renameLeadStatus, deleteLeadStatus, setDefaultLeadStatus, reorderLeadStatus } from "@/lib/actions/lead-statuses";
import { createLeadColumn, renameLeadColumn, deleteLeadColumn, reorderLeadColumn } from "@/lib/actions/lead-columns";

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

export function CrmManagePanel({
  clientId,
  statuses,
  columns,
}: {
  clientId: string;
  statuses: LeadStatus[];
  columns: LeadColumn[];
}) {
  const [open, setOpen] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<LeadColumnType>("text");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Server actions here throw meaningful business-rule errors (e.g. "לא ניתן
  // למחוק סטטוס קבוע") — without this they'd vanish as unhandled rejections.
  async function runAction(fn: () => Promise<void>) {
    setErrorMessage(null);
    try {
      await fn();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "אירעה שגיאה");
    }
  }

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary mb-4" onClick={() => setOpen(true)}>
        ⚙ ניהול סטטוסים ועמודות
      </button>
    );
  }

  return (
    <div className="card mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ניהול סטטוסים ועמודות</h2>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => setOpen(false)}>
          סגור
        </button>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">סטטוסים</h3>
        <div className="space-y-1">
          {sortedStatuses.map((status) => (
            <div key={status.id} className="flex items-center gap-2 text-sm">
              <span className="flex flex-1 items-center">
                <EditableLabel value={status.label} onSave={(label) => runAction(() => renameLeadStatus(status.id, clientId, label))} />
                {status.kind !== "open" && <span className="text-xs text-slate-400"> (קבוע)</span>}
                {status.is_default && <span className="text-xs text-slate-400"> · ברירת מחדל</span>}
              </span>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => reorderLeadStatus(status.id, clientId, "up"))}>
                ↑
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => reorderLeadStatus(status.id, clientId, "down"))}>
                ↓
              </button>
              {status.kind === "open" && !status.is_default && (
                <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => setDefaultLeadStatus(status.id, clientId))}>
                  הפוך לברירת מחדל
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                disabled={status.kind !== "open"}
                title={status.kind !== "open" ? "לא ניתן למחוק סטטוס קבוע (נסגר/אבד) — נדרש לחישובי הכנסות" : undefined}
                onClick={() => runAction(() => deleteLeadStatus(status.id, clientId))}
              >
                מחק
              </button>
            </div>
          ))}
        </div>
        <form
          action={() => {
            const label = newStatusLabel.trim();
            if (label) runAction(() => createLeadStatus(clientId, label));
            setNewStatusLabel("");
          }}
          className="mt-2 flex gap-2"
        >
          <input className="input" placeholder="סטטוס חדש" value={newStatusLabel} onChange={(e) => setNewStatusLabel(e.target.value)} />
          <button type="submit" className="btn btn-secondary text-xs">
            + הוסף
          </button>
        </form>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">עמודות מותאמות אישית</h3>
        <div className="space-y-1">
          {sortedColumns.map((col) => (
            <div key={col.id} className="flex items-center gap-2 text-sm">
              <span className="flex flex-1 items-center">
                <EditableLabel value={col.name} onSave={(name) => runAction(() => renameLeadColumn(col.id, clientId, name))} />
                <span className="text-xs text-slate-400"> ({col.type === "number" ? "מספר" : "טקסט"})</span>
              </span>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => reorderLeadColumn(col.id, clientId, "up"))}>
                ↑
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => reorderLeadColumn(col.id, clientId, "down"))}>
                ↓
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => deleteLeadColumn(col.id, clientId))}>
                מחק
              </button>
            </div>
          ))}
        </div>
        <form
          action={() => {
            const name = newColumnName.trim();
            const type = newColumnType;
            if (name) runAction(() => createLeadColumn(clientId, name, type));
            setNewColumnName("");
          }}
          className="mt-2 flex gap-2"
        >
          <input className="input" placeholder="שם עמודה" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} />
          <select className="input w-28" value={newColumnType} onChange={(e) => setNewColumnType(e.target.value as LeadColumnType)}>
            <option value="text">טקסט</option>
            <option value="number">מספר</option>
          </select>
          <button type="submit" className="btn btn-secondary text-xs">
            + הוסף
          </button>
        </form>
      </div>
    </div>
  );
}
