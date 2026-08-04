"use client";

import { useState } from "react";
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";
import { serializeSteps, stepToRow, type StepRow, type StepUnit } from "@/lib/forms/steps";

type Row = StepRow & { key: number };

let nextKey = 0;

function toRows(steps: WhatsappAutomationStep[]): Row[] {
  const base: StepRow[] = steps.length > 0 ? steps.map(stepToRow) : [{ type: "message", text: "" }];
  return base.map((row) => ({ ...row, key: nextKey++ }));
}

export function StepsEditor({ name, defaultValue }: { name: string; defaultValue: WhatsappAutomationStep[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultValue));
  const [dragKey, setDragKey] = useState<number | null>(null);

  function addRow() {
    setRows((prev) => [...prev, { type: "message", text: "", key: nextKey++ }]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function setType(key: number, type: StepRow["type"]) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key ? (type === "wait" ? { key, type, amount: 30, unit: "minutes" } : { key, type, text: "" }) : row
      )
    );
  }

  function setText(key: number, text: string) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "message" ? { ...row, text } : row)));
  }

  function setAmount(key: number, amount: number) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "wait" ? { ...row, amount } : row)));
  }

  function setUnit(key: number, unit: StepUnit) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "wait" ? { ...row, unit } : row)));
  }

  function reorder(targetKey: number) {
    if (dragKey === null || dragKey === targetKey) return;
    setRows((prev) => {
      const fromIndex = prev.findIndex((row) => row.key === dragKey);
      const toIndex = prev.findIndex((row) => row.key === targetKey);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragKey(null);
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.key}
          draggable
          onDragStart={(e) => {
            setDragKey(row.key);
            e.dataTransfer.setData("text/plain", String(row.key));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => reorder(row.key)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"
        >
          <span className="cursor-move text-slate-400" title="גרור לשינוי סדר">
            ⠿
          </span>
          <select className="input w-32" value={row.type} onChange={(e) => setType(row.key, e.target.value as StepRow["type"])}>
            <option value="message">הודעה</option>
            <option value="wait">המתנה</option>
          </select>
          {row.type === "message" ? (
            <textarea
              className="input flex-1"
              rows={2}
              placeholder="טקסט ההודעה"
              value={row.text}
              onChange={(e) => setText(row.key, e.target.value)}
            />
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <input
                className="input w-24"
                type="number"
                min={0}
                value={row.amount}
                onChange={(e) => setAmount(row.key, Number(e.target.value))}
              />
              <select className="input w-28" value={row.unit} onChange={(e) => setUnit(row.key, e.target.value as StepUnit)}>
                <option value="minutes">דקות</option>
                <option value="hours">שעות</option>
                <option value="days">ימים</option>
              </select>
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => removeRow(row.key)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addRow}>
        + הוסף שלב
      </button>
      <input type="hidden" name={name} value={serializeSteps(rows)} />
    </div>
  );
}
