"use client";

import { useState } from "react";
import type { QuestionnaireQuestion, QuestionnaireQuestionType } from "@dashboard-lior/shared";

type Row = QuestionnaireQuestion & { key: number };

let nextKey = 0;

const TYPE_LABEL: Record<QuestionnaireQuestionType, string> = {
  text: "טקסט קצר",
  textarea: "טקסט ארוך",
  number: "מספר",
  rating: "דירוג 1–5",
};

/**
 * Turns a label into a stable answer key. Answers are stored keyed by question
 * id, so ids must not change when a label is edited later — an existing row
 * keeps whatever id it already has, and only brand-new rows get slugged.
 */
function slugify(label: string, fallbackIndex: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `q${fallbackIndex + 1}`;
}

export function QuestionnaireEditor({ name, defaultValue }: { name: string; defaultValue: QuestionnaireQuestion[] }) {
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map((question) => ({ ...question, key: nextKey++ })));

  function updateRow(key: number, patch: Partial<QuestionnaireQuestion>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: "", label: "", type: "text", required: false, key: nextKey++ }]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function move(key: number, direction: -1 | 1) {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const serialized = JSON.stringify(
    rows
      .filter((row) => row.label.trim() !== "")
      .map((row, index) => ({
        id: row.id.trim() || slugify(row.label, index),
        label: row.label.trim(),
        type: row.type,
        required: row.required,
      }))
  );

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
          <input
            className="input sm:flex-1"
            placeholder="השאלה שהלקוח יראה"
            value={row.label}
            onChange={(e) => updateRow(row.key, { label: e.target.value })}
          />
          <select
            className="input sm:max-w-[10rem]"
            value={row.type}
            onChange={(e) => updateRow(row.key, { type: e.target.value as QuestionnaireQuestionType })}
          >
            {(Object.keys(TYPE_LABEL) as QuestionnaireQuestionType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" checked={row.required} onChange={(e) => updateRow(row.key, { required: e.target.checked })} />
            חובה
          </label>
          <button type="button" className="btn btn-secondary text-xs" onClick={() => move(row.key, -1)} disabled={index === 0}>
            ↑
          </button>
          <button type="button" className="btn btn-secondary text-xs" onClick={() => move(row.key, 1)} disabled={index === rows.length - 1}>
            ↓
          </button>
          <button type="button" className="btn btn-secondary text-xs" onClick={() => removeRow(row.key)}>
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary" onClick={addRow}>
        + הוסף שאלה
      </button>

      <input type="hidden" name={name} value={serialized} />
    </div>
  );
}
