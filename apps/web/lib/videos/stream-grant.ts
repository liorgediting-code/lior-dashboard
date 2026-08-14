import { createHmac, timingSafeEqual } from "crypto";

/**
 * A short-lived, server-signed permission to stream ONE video.
 *
 * Why this exists: the stream route serves client ad footage at a guessable
 * URL (`/api/videos/<uuid>/stream`). The repo's usual guard, `assertCrmAccess`,
 * passes when there is no portal session cookie at all — correct for server
 * actions reached from the open-by-design admin dashboard, but wrong for a
 * public GET, because a portal client can simply DELETE their cookie and then
 * read any other client's video by id. That inverts the protection: only
 * logged-in clients would be constrained.
 *
 * So the route stops treating "no cookie" as proof of anything. Instead the
 * pages that already know the caller is entitled (the admin page, and the
 * portal page behind requireClientSession) mint a grant and put it in the
 * <video> src. Possession of a valid grant is the authorisation.
 *
 * This is scoped deliberately narrowly — it authorises one video id for a few
 * hours, not a session — so a URL copied out of devtools or shared in a chat
 * stops working on its own instead of becoming a permanent back door.
 */

const GRANT_TTL_MS = 6 * 60 * 60 * 1000; // 6h: long enough to review, short enough that a leaked URL dies.

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(videoId: string, expiresAt: number): string {
  return createHmac("sha256", getSecret()).update(`${videoId}.${expiresAt}`).digest("hex");
}

export function signVideoGrant(videoId: string, expiresAt: number = Date.now() + GRANT_TTL_MS): string {
  return `${expiresAt}.${sign(videoId, expiresAt)}`;
}

/**
 * Verified against the video id from the URL PATH, never against an id
 * carried inside the token — otherwise a grant for a video you may see would
 * also unlock one you may not.
 */
export function verifyVideoGrant(token: string | null | undefined, videoId: string): boolean {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator === -1) return false;

  const expiresAtStr = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  let expected: string;
  try {
    expected = sign(videoId, expiresAt);
  } catch {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a forged token is the expected way to hit this.
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/** The query parameter the stream route reads the grant from. */
export const VIDEO_GRANT_PARAM = "grant";
