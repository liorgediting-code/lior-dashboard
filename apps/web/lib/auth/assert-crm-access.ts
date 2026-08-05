import "server-only";
import { cookies } from "next/headers";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "./client-session";

/**
 * Call at the top of every server action that mutates one client's CRM
 * data. Passes when there's no portal session cookie at all (the open
 * internal dashboard calling it — no login exists there by design) but
 * rejects when a session cookie exists for a DIFFERENT client than the
 * one being mutated, so a logged-in portal client can never touch
 * another client's data just by knowing its UUID.
 */
export function assertCrmAccess(clientId: string): void {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return;
  const session = verifyClientSession(cookieValue);
  if (!session || session.clientId !== clientId) {
    throw new Error("אין הרשאה לפעולה זו");
  }
}
