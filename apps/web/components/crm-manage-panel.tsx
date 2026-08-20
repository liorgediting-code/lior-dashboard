"use client";

import { useState } from "react";
import type { LeadStatus, LeadColumn, LeadColumnType, WebhookFieldMapping } from "@dashboard-lior/shared";
import { createLeadStatus, renameLeadStatus, deleteLeadStatus, setDefaultLeadStatus, reorderLeadStatus } from "@/lib/actions/lead-statuses";
import { createLeadColumn, renameLeadColumn, deleteLeadColumn, reorderLeadColumn } from "@/lib/actions/lead-columns";
import { createColumnFromWebhookKey, deleteWebhookFieldMapping, setWebhookFieldMapping } from "@/lib/actions/webhook-mappings";
import { moveCrmColumn, toggleCrmColumnVisibility } from "@/lib/actions/crm-layout";
import { setCrmThemeColor } from "@/lib/actions/crm-theme";
import { CRM_THEME_COLORS, type CrmThemeColor } from "@dashboard-lior/shared";
import type { ResolvedColumn } from "@/lib/crm/column-layout";

const THEME_COLOR_LABELS: Record<CrmThemeColor, string> = {
  blue: "כחול",
  green: "ירוק",
  purple: "סגול",
  rose: "ורוד",
  amber: "ענבר",
  teal: "טורקיז",
  slate: "אפור",
};

const THEME_COLOR_SWATCH_CLASS: Record<CrmThemeColor, string> = {
  blue: "bg-blue-600",
  green: "bg-green-600",
  purple: "bg-purple-600",
  rose: "bg-rose-600",
  amber: "bg-amber-600",
  teal: "bg-teal-600",
  slate: "bg-slate-600",
};

/** Sentinel select value meaning "create a new column for this field" — never a real column id (those are uuids). */
const NEW_COLUMN_TARGET = "__new_column__";

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

export type WebhookMappingProps = {
  mappings: WebhookFieldMapping[];
  /** Keys already seen on real leads that aren't routed anywhere yet. */
  suggestedKeys: string[];
};

export function CrmManagePanel({
  clientId,
  statuses,
  columns,
  columnLayout,
  themeColor,
  webhook,
}: {
  clientId: string;
  statuses: LeadStatus[];
  columns: LeadColumn[];
  /** Resolved order + visibility of every column shown in the CRM table, built-in and custom together. */
  columnLayout: ResolvedColumn[];
  /** Null = default blue. */
  themeColor: CrmThemeColor | null;
  /** Omitted in the client portal — webhook plumbing is an agency concern. */
  webhook?: WebhookMappingProps;
}) {
  const [open, setOpen] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<LeadColumnType>("text");
  const [newMappingKey, setNewMappingKey] = useState("");
  const [newMappingTarget, setNewMappingTarget] = useState("ignore");
  const [newMappingColumnName, setNewMappingColumnName] = useState("");
  const [newMappingColumnType, setNewMappingColumnType] = useState<LeadColumnType>("text");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Which existing mapping row is mid-"create a new column for this field" —
  // that needs a name typed in before it can be saved, so picking it from the
  // select can't fire the action immediately the way other targets do.
  const [renamingMappingId, setRenamingMappingId] = useState<string | null>(null);
  const [renamingColumnName, setRenamingColumnName] = useState("");
  const [renamingColumnType, setRenamingColumnType] = useState<LeadColumnType>("text");

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

  const [mappingSuccessMessage, setMappingSuccessMessage] = useState<string | null>(null);

  // Same as runAction, but for the webhook-mapping actions specifically —
  // those save silently otherwise, so routing a field to an EXISTING column
  // (e.g. "phone") gives no sign anything happened beyond the select
  // snapping back to its old-looking value.
  async function runMappingAction(fn: () => Promise<void>, successText: string) {
    setErrorMessage(null);
    setMappingSuccessMessage(null);
    try {
      await fn();
      setMappingSuccessMessage(successText);
      setTimeout(() => setMappingSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "אירעה שגיאה");
    }
  }

  function describeTarget(target: string, cols: LeadColumn[]): string {
    if (target === "ignore") return "התעלם";
    if (target === "name") return "שם";
    if (target === "phone") return "טלפון";
    if (target === "email") return "אימייל";
    return `עמודה: ${cols.find((c) => c.id === target)?.name ?? target}`;
  }

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  const panelTitle = webhook ? "ניהול סטטוסים, עמודות ו-Webhook" : "ניהול סטטוסים ועמודות";

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary mb-4" onClick={() => setOpen(true)}>
        ⚙ {panelTitle}
      </button>
    );
  }

  return (
    <div className="card mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{panelTitle}</h2>
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

      <div>
        <h3 className="mb-1 text-sm font-medium text-slate-700">עמודות מוצגות בטבלת ה-CRM</h3>
        <p className="mb-2 text-xs text-slate-500">
          סדר והצגה של כל העמודות בטבלה — הקבועות והמותאמות אישית יחד. הסתרה לא מוחקת נתונים, רק לא מציגה את העמודה. שם וסטטוס תמיד מוצגים.
        </p>
        <div className="space-y-1">
          {columnLayout.map((col) => (
            <div key={col.key} className="flex items-center gap-2 text-sm">
              <span className={`flex-1 ${col.hidden ? "text-slate-400 line-through" : ""}`}>
                {col.label}
                {!col.isBuiltIn && <span className="text-xs text-slate-400"> (מותאמת אישית)</span>}
              </span>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => moveCrmColumn(clientId, col.key, "up"))}>
                ↑
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => runAction(() => moveCrmColumn(clientId, col.key, "down"))}>
                ↓
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                disabled={col.lockedVisible}
                title={col.lockedVisible ? "לא ניתן להסתיר עמודה זו" : undefined}
                onClick={() => runAction(() => toggleCrmColumnVisibility(clientId, col.key))}
              >
                {col.hidden ? "הצג" : "הסתר"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">ערכת צבעים</h3>
        <div className="flex flex-wrap gap-2">
          {CRM_THEME_COLORS.map((color) => {
            const isSelected = (themeColor ?? "blue") === color;
            return (
              <button
                key={color}
                type="button"
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  isSelected ? "border-slate-800" : "border-slate-200 hover:border-slate-400"
                }`}
                onClick={() => runAction(() => setCrmThemeColor(clientId, color))}
              >
                <span className={`h-3 w-3 rounded-full ${THEME_COLOR_SWATCH_CLASS[color]}`} />
                {THEME_COLOR_LABELS[color]}
                {isSelected && " ✓"}
              </button>
            );
          })}
        </div>
      </div>

      {webhook && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-slate-700">מבנה ה-Webhook</h3>
          <p className="mb-2 text-xs text-slate-500">
            לאן נכנס כל שדה שמגיע מטופס הלידים. שדות בשם name / full_name / phone / phone_number / email משויכים אוטומטית — כאן מוסיפים את
            שאר השאלות של הטופס. שדה שאין לו כלל לא הולך לאיבוד: הוא נשמר בשם המקורי שלו.
          </p>
          {mappingSuccessMessage && <p className="mb-2 text-sm text-green-700">✓ {mappingSuccessMessage}</p>}

          <div className="space-y-1">
            {webhook.mappings.map((mapping) => (
              <div key={mapping.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate" title={mapping.source_key}>
                    {mapping.source_key}
                  </span>
                  <span className="text-slate-400">←</span>
                  <select
                    className="input w-44"
                    value={renamingMappingId === mapping.id ? NEW_COLUMN_TARGET : mapping.target}
                    onChange={(e) => {
                      if (e.target.value === NEW_COLUMN_TARGET) {
                        setRenamingMappingId(mapping.id);
                        setRenamingColumnName(mapping.source_key);
                        setRenamingColumnType("text");
                        return;
                      }
                      setRenamingMappingId(null);
                      const target = e.target.value;
                      runMappingAction(
                        () => setWebhookFieldMapping(clientId, mapping.source_key, target),
                        `"${mapping.source_key}" עודכן ל-${describeTarget(target, sortedColumns)}.`
                      );
                    }}
                  >
                    <TargetOptions columns={sortedColumns} />
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={() => runAction(() => deleteWebhookFieldMapping(mapping.id, clientId))}
                  >
                    מחק
                  </button>
                </div>
                {renamingMappingId === mapping.id && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 rounded bg-slate-50 p-2 text-sm">
                    <span className="text-xs text-slate-500">שם העמודה החדשה:</span>
                    <input
                      autoFocus
                      className="input flex-1"
                      value={renamingColumnName}
                      onChange={(e) => setRenamingColumnName(e.target.value)}
                    />
                    <select className="input w-28" value={renamingColumnType} onChange={(e) => setRenamingColumnType(e.target.value as LeadColumnType)}>
                      <option value="text">טקסט</option>
                      <option value="number">מספר</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      onClick={() => {
                        const name = renamingColumnName.trim();
                        if (!name) {
                          setErrorMessage("צריך למלא שם עמודה");
                          return;
                        }
                        runMappingAction(
                          () => createColumnFromWebhookKey(clientId, mapping.source_key, name, renamingColumnType),
                          `"${mapping.source_key}" נוסף לעמודה החדשה "${name}".`
                        );
                        setRenamingMappingId(null);
                      }}
                    >
                      צור עמודה
                    </button>
                    <button type="button" className="btn btn-secondary text-xs" onClick={() => setRenamingMappingId(null)}>
                      ביטול
                    </button>
                  </div>
                )}
              </div>
            ))}
            {webhook.mappings.length === 0 && <p className="text-sm text-slate-500">אין עדיין שדות מוגדרים.</p>}
          </div>

          <form
            action={() => {
              const sourceKey = newMappingKey.trim();
              if (!sourceKey) {
                setErrorMessage("צריך למלא שם שדה לפני שלוחצים הוסף");
                return;
              }
              if (newMappingTarget === NEW_COLUMN_TARGET) {
                const name = newMappingColumnName.trim();
                if (!name) {
                  setErrorMessage("צריך למלא שם עמודה");
                  return;
                }
                runMappingAction(
                  () => createColumnFromWebhookKey(clientId, sourceKey, name, newMappingColumnType),
                  `"${sourceKey}" נוסף לעמודה החדשה "${name}".`
                );
              } else {
                runMappingAction(
                  () => setWebhookFieldMapping(clientId, sourceKey, newMappingTarget),
                  `"${sourceKey}" נשמר → ${describeTarget(newMappingTarget, sortedColumns)}.`
                );
              }
              setNewMappingKey("");
              setNewMappingColumnName("");
            }}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <input
              className="input flex-1"
              list="webhook-suggested-keys"
              placeholder="שם השדה כפי שהוא מגיע"
              value={newMappingKey}
              onChange={(e) => {
                setNewMappingKey(e.target.value);
                // Keep the new-column name in sync with the key by default —
                // still fully editable, just a sane starting point.
                if (newMappingTarget === NEW_COLUMN_TARGET) setNewMappingColumnName(e.target.value);
              }}
            />
            {/* Datalist rather than a plain select: the key can be anything
                the form sends, but the ones already received are worth
                offering so they don't have to be retyped from memory. */}
            <datalist id="webhook-suggested-keys">
              {webhook.suggestedKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
            <select
              className="input w-44"
              value={newMappingTarget}
              onChange={(e) => {
                setNewMappingTarget(e.target.value);
                if (e.target.value === NEW_COLUMN_TARGET && !newMappingColumnName) setNewMappingColumnName(newMappingKey);
              }}
            >
              <TargetOptions columns={sortedColumns} />
            </select>
            {newMappingTarget === NEW_COLUMN_TARGET && (
              <>
                <span className="text-xs text-slate-500">שם העמודה:</span>
                <input
                  className="input w-40"
                  placeholder="שם העמודה שיוצג ב-CRM"
                  value={newMappingColumnName}
                  onChange={(e) => setNewMappingColumnName(e.target.value)}
                />
                <select className="input w-28" value={newMappingColumnType} onChange={(e) => setNewMappingColumnType(e.target.value as LeadColumnType)}>
                  <option value="text">טקסט</option>
                  <option value="number">מספר</option>
                </select>
              </>
            )}
            <button type="submit" className="btn btn-secondary text-xs">
              + הוסף
            </button>
          </form>

          {webhook.suggestedKeys.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-slate-500">שדות שהגיעו ועדיין לא מוגדרים — לחיצה ממלאת את הטופס למעלה כדי לתת שם לעמודה:</p>
              <div className="flex flex-wrap gap-2">
                {webhook.suggestedKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:border-slate-400 hover:bg-slate-50"
                    title="למלא את הטופס למעלה עם השדה הזה"
                    onClick={() => {
                      setNewMappingKey(key);
                      setNewMappingTarget(NEW_COLUMN_TARGET);
                      setNewMappingColumnName(key);
                    }}
                  >
                    {key} +עמודה
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TargetOptions({ columns }: { columns: LeadColumn[] }) {
  return (
    <>
      <option value="ignore">התעלם</option>
      <option value="name">שם</option>
      <option value="phone">טלפון</option>
      <option value="email">אימייל</option>
      {columns.map((column) => (
        <option key={column.id} value={column.id}>
          עמודה: {column.name}
        </option>
      ))}
      <option value={NEW_COLUMN_TARGET}>+ עמודה חדשה...</option>
    </>
  );
}
