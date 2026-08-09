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

export async function createNoteFromForm(formData: FormData) {
  const body = nullable(formData.get("body"));
  if (!body) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("notes").insert({
    body,
    // note_date is backdatable — it's the date the note is ABOUT, not when
    // the row was written (that's created_at).
    note_date: nullable(formData.get("note_date")) ?? todayIso(),
    client_id: nullable(formData.get("client_id")),
    funnel_id: nullable(formData.get("funnel_id")),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/notes");
}

export async function updateNoteFromForm(noteId: string, formData: FormData) {
  const body = nullable(formData.get("body"));
  if (!body) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("notes")
    .update({
      body,
      note_date: nullable(formData.get("note_date")) ?? todayIso(),
      client_id: nullable(formData.get("client_id")),
      funnel_id: nullable(formData.get("funnel_id")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (error) throw new Error(error.message);

  revalidatePath("/notes");
}

export async function deleteNote(noteId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);

  revalidatePath("/notes");
}
