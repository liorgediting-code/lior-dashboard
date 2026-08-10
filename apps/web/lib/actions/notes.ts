"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The same note appears in the global feed and in the client's own activity
 * log, so both have to be invalidated. On an edit that MOVES a note between
 * clients, the old client's page needs it too — hence the pair of ids.
 */
function revalidateNotes(...clientIds: (string | null | undefined)[]) {
  revalidatePath("/notes");
  for (const clientId of clientIds) {
    if (clientId) revalidatePath(`/clients/${clientId}`);
  }
}

export async function createNoteFromForm(formData: FormData) {
  const body = nullable(formData.get("body"));
  if (!body) return;

  const clientId = nullable(formData.get("client_id"));
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("notes").insert({
    body,
    // note_date is backdatable — it's the date the note is ABOUT, not when
    // the row was written (that's created_at).
    note_date: nullable(formData.get("note_date")) ?? todayIso(),
    client_id: clientId,
    funnel_id: nullable(formData.get("funnel_id")),
  });
  if (error) throw new Error(error.message);

  revalidateNotes(clientId);
}

export async function updateNoteFromForm(noteId: string, formData: FormData) {
  const body = nullable(formData.get("body"));
  if (!body) return;

  const clientId = nullable(formData.get("client_id"));
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("notes").select("client_id").eq("id", noteId).maybeSingle();

  const { error } = await supabase
    .from("notes")
    .update({
      body,
      note_date: nullable(formData.get("note_date")) ?? todayIso(),
      client_id: clientId,
      funnel_id: nullable(formData.get("funnel_id")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (error) throw new Error(error.message);

  revalidateNotes(clientId, existing?.client_id as string | null | undefined);
}

export async function deleteNote(noteId: string) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("notes").select("client_id").eq("id", noteId).maybeSingle();

  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);

  revalidateNotes(existing?.client_id as string | null | undefined);
}
