import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "./client-session";

/**
 * Call at the top of every protected `/client/[clientId]/*` page. Verifies
 * the session cookie belongs to THIS client, not just that some valid
 * session exists — otherwise a logged-in client could view another
 * client's leads by editing the URL.
 */
export function requireClientSession(clientId: string): void {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  const session = verifyClientSession(cookieValue);
  if (!session || session.clientId !== clientId) {
    redirect(`/client/${clientId}/login`);
  }
}
