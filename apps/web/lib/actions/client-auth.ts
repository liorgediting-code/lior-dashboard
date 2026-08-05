"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword, generateRandomPassword } from "@/lib/auth/password";
import { CLIENT_SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signClientSession } from "@/lib/auth/client-session";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";

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

export async function logoutClientAction(clientId: string) {
  cookies().delete(CLIENT_SESSION_COOKIE_NAME);
  redirect(`/client/${clientId}/login`);
}

export async function regenerateClientPasswordAction(clientId: string): Promise<string> {
  assertCrmAccess(clientId);
  const supabase = supabaseAdmin();
  const newPassword = generateRandomPassword();
  const hash = await hashPassword(newPassword);
  const { error } = await supabase.from("clients").update({ crm_password_hash: hash }).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/edit`);
  return newPassword;
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
  redirect(`/client/${clientId}/crm?password_success=1`);
}
