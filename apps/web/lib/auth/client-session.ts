import { createHmac, timingSafeEqual } from "crypto";

export const CLIENT_SESSION_COOKIE_NAME = "client_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

/**
 * `passwordHashPrefix` binds the session to the password that created it —
 * `requireClientSession` compares it against the client's *current*
 * `crm_password_hash`, so rotating or changing the password immediately
 * invalidates every cookie issued under the old one.
 */
export function signClientSession(
  clientId: string,
  passwordHashPrefix: string,
  expiresAt: Date = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
): string {
  const payload = `${clientId}.${passwordHashPrefix}.${expiresAt.getTime()}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyClientSession(
  cookieValue: string | undefined
): { clientId: string; passwordHashPrefix: string } | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return null;

  const [clientId, passwordHashPrefix, expiresAtStr, signature] = parts;
  const payload = `${clientId}.${passwordHashPrefix}.${expiresAtStr}`;

  let expectedSignature: string;
  try {
    expectedSignature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  } catch {
    return null;
  }

  const expectedBuf = Buffer.from(expectedSignature, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { clientId, passwordHashPrefix };
}
