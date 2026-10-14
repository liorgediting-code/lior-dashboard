"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAgencyAccess } from "@/lib/auth/assert-agency-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

function nullable(value: FormDataEntryValue | string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A board shows in the global list and on its client's Boards tab. A
 * reassignment has to refresh BOTH the old and the new client, hence the list
 * of ids.
 */
function revalidateBoards(...clientIds: (string | null | undefined)[]) {
  revalidatePath("/boards");
  for (const clientId of clientIds) {
    if (clientId) revalidatePath(`/clients/${clientId}/boards`);
  }
}

export async function createBoard(name: string, clientId: string | null, elements: unknown[] = []): Promise<string> {
  assertAgencyAccess();
  const { data, error } = await supabaseAdmin()
    .from("boards")
    .insert({ name: nullable(name) ?? "Untitled", client_id: clientId, elements })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidateBoards(clientId);
  return data.id as string;
}

export async function createBoardFromForm(formData: FormData) {
  const id = await createBoard(String(formData.get("name") ?? ""), nullable(formData.get("client_id")));
  redirect(`/boards/${id}`);
}

export async function saveBoardElements(boardId: string, elements: unknown[]): Promise<{ ok: boolean; error?: string }> {
  assertAgencyAccess();
  if (!Array.isArray(elements)) return { ok: false, error: "bad payload" };
  const { error } = await supabaseAdmin()
    .from("boards")
    .update({ elements, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  // Not revalidating the list here: autosave fires every second while
  // drawing, and the list only shows name/client/updated_at.
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function renameBoard(boardId: string, name: string) {
  assertAgencyAccess();
  const trimmed = nullable(name);
  if (!trimmed) return;
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("boards").select("client_id").eq("id", boardId).maybeSingle();
  const { error } = await supabase.from("boards").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidateBoards(existing?.client_id);
}

export async function setBoardClient(boardId: string, clientId: string | null) {
  assertAgencyAccess();
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("boards").select("client_id").eq("id", boardId).maybeSingle();
  const { error } = await supabase.from("boards").update({ client_id: clientId }).eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidateBoards(clientId, existing?.client_id);
}

export async function setBoardClientFromForm(boardId: string, formData: FormData) {
  await setBoardClient(boardId, nullable(formData.get("client_id")));
}

export async function deleteBoard(boardId: string) {
  assertAgencyAccess();
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("boards").select("client_id").eq("id", boardId).maybeSingle();
  const { error } = await supabase.from("boards").delete().eq("id", boardId);
  if (error) throw new Error(error.message);
  revalidateBoards(existing?.client_id);
}
