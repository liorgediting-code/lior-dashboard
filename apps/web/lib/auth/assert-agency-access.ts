import "server-only";
import { cookies } from "next/headers";
import { CLIENT_SESSION_COOKIE_NAME } from "./client-session";

/**
 * Call at the top of every server action only the AGENCY may run.
 *
 * The mirror image of assertCrmAccess: that one scopes a mutation to one
 * client, this one rejects portal clients outright. The internal dashboard
 * has no login by design, so "no portal session cookie" is how the agency
 * identifies itself — the same assumption assertCrmAccess already makes.
 * Add a real agency auth check here when the dashboard gets one (see
 * lib/auth/get-current-actor.ts).
 */
export function assertAgencyAccess(): void {
  // The mere PRESENCE of a portal cookie is disqualifying — an expired or
  // tampered one still means the caller is a client's browser, not ours, so
  // verifying it would only hand the agency path to anyone whose session
  // lapsed.
  if (cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value) {
    throw new Error("אין הרשאה לפעולה זו");
  }
}
