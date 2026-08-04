import type { DriveLink } from "@dashboard-lior/shared";

/** Drops rows where both fields are empty, and trims whitespace. */
export function serializeDriveLinks(rows: DriveLink[]): string {
  const cleaned = rows
    .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter((row) => row.label !== "" || row.url !== "");
  return JSON.stringify(cleaned);
}
