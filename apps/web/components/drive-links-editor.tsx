"use client";

import { useState } from "react";
import type { DriveLink } from "@dashboard-lior/shared";
import { serializeDriveLinks } from "@/lib/forms/drive-links";

type Row = DriveLink & { key: number };

let nextKey = 0;

function toRows(links: DriveLink[]): Row[] {
  return links.length > 0 ? links.map((link) => ({ ...link, key: nextKey++ })) : [{ label: "", url: "", key: nextKey++ }];
}

export function DriveLinksEditor({ name, defaultValue }: { name: string; defaultValue: DriveLink[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultValue));

  function updateRow(key: number, field: "label" | "url", value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { label: "", url: "", key: nextKey++ }]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2">
          <input
            className="input"
            placeholder="תווית (למשל: תיקיית קריאייטיב)"
            value={row.label}
            onChange={(e) => updateRow(row.key, "label", e.target.value)}
          />
          <input
            className="input"
            placeholder="קישור"
            value={row.url}
            onChange={(e) => updateRow(row.key, "url", e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => removeRow(row.key)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addRow}>
        + הוסף קישור
      </button>
      <input type="hidden" name={name} value={serializeDriveLinks(rows)} />
    </div>
  );
}
