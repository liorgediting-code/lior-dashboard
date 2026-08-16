/**
 * Turns whatever the user pasted into a bare Drive folder id.
 *
 * Nobody copies an id — they copy the address bar or "Get link", and Drive
 * has several shapes for the same folder. Storing the raw URL would make
 * `files.list?q='<url>' in parents` return an empty list instead of an
 * error, so the sync would report "0 videos" on a folder full of them.
 * Every shape has to collapse to the id here, or not be stored at all.
 */

/** Ids are base64url-ish. The length floor rejects a word someone typed by mistake. */
const BARE_ID = /^[A-Za-z0-9_-]{10,}$/;

export class InvalidDriveFolderError extends Error {
  constructor() {
    super("קישור תיקיית Drive לא תקין. הדביקו את הקישור מ״קבלת קישור״ או את מזהה התיקייה.");
    this.name = "InvalidDriveFolderError";
  }
}

/**
 * Accepts:
 *   https://drive.google.com/drive/folders/<id>?usp=sharing
 *   https://drive.google.com/drive/u/0/folders/<id>      (multi-account)
 *   https://drive.google.com/open?id=<id>
 *   <id>
 *
 * Returns null for empty input — a cleared field must store null, never "",
 * because `Boolean("")` is false but `"" != null` is true, and the two
 * disagree about whether a folder is configured.
 */
export function parseDriveFolderId(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;

  if (BARE_ID.test(trimmed)) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new InvalidDriveFolderError();
    }

    // `?id=` wins when present — `open?id=` has no folder segment at all.
    const queryId = url.searchParams.get("id");
    if (queryId && BARE_ID.test(queryId)) return queryId;

    // Take the segment AFTER "folders", so the /u/0/ variant works without
    // a second pattern: the id is positional, not at a fixed depth.
    const segments = url.pathname.split("/").filter(Boolean);
    const afterFolders = segments[segments.indexOf("folders") + 1];
    if (segments.includes("folders") && afterFolders && BARE_ID.test(afterFolders)) {
      return afterFolders;
    }
  }

  throw new InvalidDriveFolderError();
}
