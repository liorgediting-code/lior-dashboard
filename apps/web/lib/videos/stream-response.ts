/**
 * Shapes the browser-facing response for a proxied Drive video.
 *
 * Split out of the route so seeking is testable without Drive credentials:
 * this is the part that decides whether a <video> element can seek, and
 * getting it wrong fails silently — the video plays from the start and the
 * scrub bar simply refuses to move, with no error anywhere.
 */

/**
 * Drive labels .mov exports `video/quicktime`, which several playback paths
 * treat as unplayable and refuse before decoding a single byte — even when
 * the bytes are a perfectly ordinary MP4-family stream.
 *
 * A .mov IS an ISO-BMFF container, the same family as .mp4, so reporting it
 * as video/mp4 is accurate rather than a lie to the browser. Note this only
 * fixes the CONTAINER label: it cannot make an undecodable codec playable
 * (these exports are HEVC, which needs hardware support on the viewer's
 * machine), so a file that still won't play after this is a codec problem,
 * not a header one.
 */
const CONTAINER_ALIASES: Record<string, string> = {
  "video/quicktime": "video/mp4",
  "video/x-quicktime": "video/mp4",
};

/** Maps a container's alias to the label browsers actually accept, preserving any parameters. */
export function normaliseVideoContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  // Split the parameters off (`video/quicktime; charset=...`) so a header
  // that carries them still matches, then reattach them untouched.
  const [base, ...rest] = contentType.split(";");
  const alias = CONTAINER_ALIASES[base.trim().toLowerCase()];
  if (!alias) return contentType;
  return [alias, ...rest].join(";");
}

export type StreamResponseInit = {
  status: number;
  headers: Headers;
};

/**
 * Whitelist, never a spread of Drive's headers. Drive's response carries
 * auth-adjacent and CORS headers that must not reach the browser verbatim,
 * and `content-encoding` in particular would describe a body Next.js has
 * already decoded — passing it through corrupts the stream.
 */
export function buildStreamResponseInit(
  driveStatus: number,
  driveHeaders: Headers,
  fallbackMimeType: string | null
): StreamResponseInit {
  const headers = new Headers();

  const contentType = normaliseVideoContentType(driveHeaders.get("content-type") ?? fallbackMimeType);
  if (contentType) headers.set("Content-Type", contentType);

  const contentLength = driveHeaders.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  // Content-Range is what tells the browser WHICH bytes it got. Dropping it
  // on a 206 leaves the player unable to place the chunk, so it gives up on
  // seeking entirely — the single most load-bearing header here.
  const contentRange = driveHeaders.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  // Advertised unconditionally, including on a 200. The browser only sends
  // a Range request after it has seen this header, so omitting it on the
  // first (rangeless) response means no seek request is ever made.
  headers.set("Accept-Ranges", "bytes");

  // Status passes straight through: 206 stays 206 when Drive honoured the
  // Range, 200 when the whole file came back.
  return { status: driveStatus, headers };
}

/**
 * Maps a failed Drive response to the status we return.
 *
 * 206 is explicitly NOT a failure — `Response.ok` is false for it in some
 * runtimes' hand-rolled checks, and treating it as an error is how Range
 * support gets accidentally disabled.
 */
export function isDriveFailure(driveStatus: number): boolean {
  return driveStatus !== 206 && (driveStatus < 200 || driveStatus >= 300);
}

/** A missing file stays a 404; anything else upstream is our 502. */
export function mapDriveFailureStatus(driveStatus: number): number {
  return driveStatus === 404 ? 404 : 502;
}
