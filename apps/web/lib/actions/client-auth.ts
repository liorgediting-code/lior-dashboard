"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword, generateRandomPassword } from "@/lib/auth/password";
import { CLIENT_SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signClientSession } from "@/lib/auth/client-session";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { sendTelegramAlert } from "@/lib/notifications/telegram";

// Syntactically valid (but never-matching) salt:hash pair used to keep
// verifyPassword's scrypt cost constant when a client has no real hash yet —
// otherwise a missing hash short-circuits before scrypt runs, letting an
// attacker infer client existence/password-configured status from timing.
const DUMMY_HASH_FOR_TIMING_SAFETY = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function loginClientAction(clientId: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const hash = (client?.crm_password_hash as string | null) ?? DUMMY_HASH_FOR_TIMING_SAFETY;
  const passwordOk = await verifyPassword(password, hash);

  if (!client?.crm_password_hash || !passwordOk) {
    redirect(`/client/${clientId}/login?error=1`);
  }

  // Bind the session to the current password hash so rotating the password
  // invalidates every cookie issued under the old one.
  cookies().set(CLIENT_SESSION_COOKIE_NAME, signClientSession(clientId, hash.slice(0, 16)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect(`/client/${clientId}/crm`);
}

/**
 * Lets you (the agency) drop straight into a client's portal from their
 * edit page, without ever knowing their password. Mints a session the
 * same way loginClientAction does after a successful password check —
 * bound to whatever crm_password_hash is current right now, so it keeps
 * working even after the client has changed their own password.
 */
export async function enterAsClientAction(clientId: string) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const hash = client?.crm_password_hash as string | null;
  if (!hash) throw new Error("ללקוח הזה עדיין אין CRM פעיל");

  cookies().set(CLIENT_SESSION_COOKIE_NAME, signClientSession(clientId, hash.slice(0, 16)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect(`/client/${clientId}/crm`);
}

export async function logoutClientAction(clientId: string) {
  cookies().delete(CLIENT_SESSION_COOKIE_NAME);
  redirect(`/client/${clientId}/login`);
}

export async function regenerateClientPasswordAction(clientId: string): Promise<string> {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const newPassword = generateRandomPassword();
  const hash = await hashPassword(newPassword);
  // Also clears any pending reset request — a fresh password IS the resolution.
  const { error } = await supabase
    .from("clients")
    .update({ crm_password_hash: hash, password_reset_requested_at: null })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/edit`);
  return newPassword;
}

/**
 * Called from the (unauthenticated) client login page when someone has
 * forgotten their password. There is nothing to recover — the hash is
 * one-way — so this can't reset anything itself; it just flags the client
 * for the agency to review on their edit page and regenerate manually,
 * the same way a self-service reset would let anyone who finds the login
 * URL take over the portal.
 */
export async function requestClientPasswordResetAction(clientId: string) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
  if (!client) redirect(`/client/${clientId}/login`);

  const { error } = await supabase
    .from("clients")
    .update({ password_reset_requested_at: new Date().toISOString() })
    .eq("id", clientId);
  if (error) throw new Error(error.message);

  await sendTelegramAlert(`🔑 ${client.name as string} ביקש/ה איפוס סיסמה לפורטל. אשר בעריכת הלקוח: /clients/${clientId}/edit`);

  redirect(`/client/${clientId}/login?requested=1`);
}

export async function changeClientPasswordAction(clientId: string, formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");

  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const hash = client?.crm_password_hash as string | null;

  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    redirect(`/client/${clientId}/crm?password_error=wrong_password`);
  }
  if (newPassword.length < 8) {
    redirect(`/client/${clientId}/crm?password_error=too_short`);
  }

  const newHash = await hashPassword(newPassword);
  const { error } = await supabase.from("clients").update({ crm_password_hash: newHash }).eq("id", clientId);
  if (error) throw new Error(error.message);

  // Sessions are bound to the hash they were issued under (see
  // loginClientAction), so without re-signing here the client would be
  // silently logged out by their own password change.
  cookies().set(CLIENT_SESSION_COOKIE_NAME, signClientSession(clientId, newHash.slice(0, 16)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect(`/client/${clientId}/crm?password_success=1`);
}
