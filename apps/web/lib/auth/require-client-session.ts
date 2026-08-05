import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "./client-session";

/**
 * Call at the top of every protected `/client/[clientId]/*` page. Verifies
 * the session cookie belongs to THIS client, not just that some valid
 * session exists — otherwise a logged-in client could view another
 * client's leads by editing the URL. Also re-checks the session's
 * password-hash fragment against the client's current hash, so rotating
 * or changing the password logs out every existing session.
 */
export async function requireClientSession(clientId: string): Promise<void> {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  const session = verifyClientSession(cookieValue);
  if (!session || session.clientId !== clientId) {
    redirect(`/client/${clientId}/login`);
  }

  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const currentHash = client?.crm_password_hash as string | null;
  if (!currentHash || currentHash.slice(0, 16) !== session.passwordHashPrefix) {
    redirect(`/client/${clientId}/login`);
  }
}
