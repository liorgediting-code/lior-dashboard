import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Google Drive access for client video review.
 *
 * The agency's client-video folders are shared "anyone with the link", so
 * this reads them with a plain API key rather than OAuth/a service account
 * — chosen deliberately for v1 because there is no per-client consent flow
 * to build. `driveAuthQuery()` is the ONLY place that knows this: it's the
 * seam. Moving to a service account later (e.g. for private folders) means
 * changing this one function to return an Authorization header instead of
 * a `key` query param — no caller below it changes.
 */

const API_KEY = process.env.GOOGLE_API_KEY;
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export class DriveNotConfiguredError extends Error {
  constructor() {
    super("Google Drive is not configured. Add GOOGLE_API_KEY to apps/web/.env.local.");
    this.name = "DriveNotConfiguredError";
  }
}

export function isDriveConfigured(): boolean {
  return Boolean(API_KEY);
}

/** The auth to attach to a Drive request. Swap the body of this one function to move off API-key auth. */
function driveAuthQuery(): URLSearchParams {
  if (!API_KEY) throw new DriveNotConfiguredError();
  return new URLSearchParams({ key: API_KEY });
}

/** Fields requested for both the list call and (implicitly) what we upsert. */
const FILE_FIELDS = "id,name,mimeType,size,videoMediaMetadata(durationMillis),thumbnailLink";

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  // Drive's JSON API returns int64 fields (size, durationMillis) as
  // STRINGS to avoid precision loss in JS numbers — Number() them, and
  // never trust a bare `0` fallback for duration (see below).
  size?: string;
  videoMediaMetadata?: { durationMillis?: string };
  thumbnailLink?: string;
};

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

export type DriveVideoFile = {
  driveFileId: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Null until Drive finishes processing and reports a duration — never defaults to 0. */
  durationSeconds: number | null;
  thumbnailUrl: string | null;
};

function toDriveVideoFile(file: DriveFile): DriveVideoFile {
  const durationMillis = file.videoMediaMetadata?.durationMillis;
  return {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType ?? null,
    sizeBytes: file.size != null ? Number(file.size) : null,
    durationSeconds: durationMillis != null ? Number(durationMillis) / 1000 : null,
    thumbnailUrl: file.thumbnailLink ?? null,
  };
}

/** Lists every video file directly inside a Drive folder, paginating until Drive stops returning a nextPageToken. */
export async function listFolderVideos(folderId: string): Promise<DriveVideoFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = driveAuthQuery();
    params.set("q", `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`);
    params.set("fields", `nextPageToken,files(${FILE_FIELDS})`);
    params.set("pageSize", "1000");
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Drive files.list ${res.status} for folder ${folderId}: ${await res.text()}`);
    }
    const body = (await res.json()) as DriveListResponse;
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return files.map(toDriveVideoFile);
}

/**
 * Syncs one client's Drive folder into `client_videos`. Upserts on
 * (client_id, drive_file_id) so re-running the sync is idempotent and
 * picks up duration once Drive finishes processing a file that was null
 * on a previous run.
 */
export async function syncClientVideos(clientId: string, folderId: string): Promise<number> {
  const files = await listFolderVideos(folderId);
  if (files.length === 0) return 0;

  const supabase = supabaseAdmin();
  const rows = files.map((file) => ({
    client_id: clientId,
    drive_file_id: file.driveFileId,
    name: file.name,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    duration_seconds: file.durationSeconds,
    thumbnail_url: file.thumbnailUrl,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("client_videos").upsert(rows, { onConflict: "client_id,drive_file_id" });
  if (error) throw new Error(error.message);

  return rows.length;
}

/** Fetches the raw bytes of one Drive file, forwarding an optional Range header for seek support. */
export async function fetchDriveFileBytes(fileId: string, rangeHeader: string | null): Promise<Response> {
  const params = driveAuthQuery();
  params.set("alt", "media");

  const headers: HeadersInit = {};
  if (rangeHeader) headers["Range"] = rangeHeader;

  return fetch(`${DRIVE_FILES_URL}/${fileId}?${params.toString()}`, { headers, cache: "no-store" });
}
