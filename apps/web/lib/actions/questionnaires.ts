"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertCrmAccess } from "@/lib/auth/assert-crm-access";
import { normalizeQuestions, resolveTemplateForClient, weekStartIso } from "@/lib/crm/questionnaire";
import type { QuestionnaireQuestion } from "@dashboard-lior/shared";

/** The QuestionnaireEditor posts its rows as a JSON string in a hidden input. */
function parseQuestions(value: FormDataEntryValue | null): QuestionnaireQuestion[] {
  try {
    return normalizeQuestions(JSON.parse(String(value ?? "[]")));
  } catch {
    return [];
  }
}

/**
 * Saves the global template (clientId null) or one client's override.
 *
 * Deliberately select-then-update/insert rather than `.upsert()`: BOTH unique
 * indexes on this table are PARTIAL (`... where client_id is null` and
 * `... where client_id is not null`). Postgres only infers a partial index as
 * an ON CONFLICT arbiter when the conflict target repeats the index's WHERE
 * predicate, which supabase-js's `onConflict` option can't express — an upsert
 * here fails with "no unique or exclusion constraint matching the ON CONFLICT
 * specification". This form is correct against both indexes.
 */
export async function saveTemplateFromForm(clientId: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "שאלון שבועי";
  const questions = parseQuestions(formData.get("questions"));
  const supabase = supabaseAdmin();

  const lookup = supabase.from("questionnaire_templates").select("id");
  const { data: existing } = await (clientId === null ? lookup.is("client_id", null) : lookup.eq("client_id", clientId)).maybeSingle();

  const { error } = existing
    ? await supabase
        .from("questionnaire_templates")
        .update({ name, questions, updated_at: new Date().toISOString() })
        .eq("id", existing.id as string)
    : await supabase.from("questionnaire_templates").insert({ client_id: clientId, name, questions });
  if (error) throw new Error(error.message);

  revalidatePath("/questionnaires");
}

/** Removes a client's override so they fall back to the global template. */
export async function deleteClientTemplate(clientId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("questionnaire_templates").delete().eq("client_id", clientId);
  if (error) throw new Error(error.message);

  revalidatePath("/questionnaires");
}

/**
 * Client-facing: saves this week's answers. One row per (client, week) —
 * re-submitting the same week updates it instead of stacking rows, matching
 * the questionnaire_responses_client_week_idx unique index.
 */
export async function submitQuestionnaireFromForm(clientId: string, formData: FormData) {
  assertCrmAccess(clientId);

  const supabase = supabaseAdmin();
  const template = await resolveTemplateForClient(supabase, clientId);
  if (!template) throw new Error("לא הוגדר שאלון");

  const answers: Record<string, string | number | null> = {};
  for (const question of template.questions) {
    const raw = String(formData.get(`q_${question.id}`) ?? "").trim();
    if (raw === "") {
      answers[question.id] = null;
      continue;
    }
    if (question.type === "number" || question.type === "rating") {
      const parsed = Number(raw);
      answers[question.id] = Number.isFinite(parsed) ? parsed : null;
    } else {
      answers[question.id] = raw;
    }
  }

  const { error } = await supabase.from("questionnaire_responses").upsert(
    {
      client_id: clientId,
      template_id: template.id,
      week_start: weekStartIso(),
      answers,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "client_id,week_start" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/client/${clientId}/questionnaire`);
  revalidatePath("/questionnaires");
}
