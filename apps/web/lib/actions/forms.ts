"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { advanceStage } from "@/lib/sop/actions";
import { normalizeQuestions } from "@/lib/crm/questionnaire";
import { parseFormAnswersFromFormData } from "@/lib/forms/answers";
import { INTAKE_FORM_SLUG } from "@dashboard-lior/shared";
import type { FormSubmission, FormTemplate, QuestionnaireQuestion } from "@dashboard-lior/shared";

function formUrl(token: string): string {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${baseUrl}/form/${token}`;
}

/** The QuestionnaireEditor posts its rows as a JSON string in a hidden input. */
function parseQuestions(value: FormDataEntryValue | null): QuestionnaireQuestion[] {
  try {
    return normalizeQuestions(JSON.parse(String(value ?? "[]")));
  } catch {
    return [];
  }
}

// ---------- templates ----------

export async function createTemplateFromForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "טופס חדש";
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("form_templates")
    .insert({ name, questions: parseQuestions(formData.get("questions")) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/forms");
  redirect(`/forms?created=${data.id as string}`);
}

export async function saveTemplateFromForm(templateId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "טופס ללא שם";
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("form_templates")
    .update({ name, questions: parseQuestions(formData.get("questions")), updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/forms");
}

/** Copies a template's questions into a new, freely editable one — the way to base a form on the built-in intake. */
export async function duplicateTemplate(templateId: string) {
  const supabase = supabaseAdmin();

  const { data: source } = await supabase.from("form_templates").select("*").eq("id", templateId).single();
  if (!source) throw new Error("טופס לא נמצא");

  // slug is deliberately NOT copied: only one form may be the intake form.
  const { error } = await supabase
    .from("form_templates")
    .insert({ name: `${source.name as string} (עותק)`, questions: source.questions as QuestionnaireQuestion[] });
  if (error) throw new Error(error.message);

  revalidatePath("/forms");
}

/**
 * Templates are only deletable while nothing depends on them: the built-in
 * intake form drives the SOP stage-0 trigger, and a template with submissions
 * owns the question labels those answers are read through — deleting it would
 * leave unreadable answers behind.
 */
export async function deleteTemplate(templateId: string) {
  const supabase = supabaseAdmin();

  const { data: template } = await supabase.from("form_templates").select("slug").eq("id", templateId).single();
  if (!template) throw new Error("טופס לא נמצא");
  if (template.slug === INTAKE_FORM_SLUG) throw new Error("לא ניתן למחוק את טופס האפיון המובנה");

  const { count } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  if ((count ?? 0) > 0) throw new Error("לא ניתן למחוק טופס שכבר נשלח ללקוחות — שכפל אותו במקום");

  const { error } = await supabase.from("form_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/forms");
}

// ---------- sending ----------

/**
 * Issues (or re-reads) a client's link for one form. One row per
 * (client, template), so sending twice hands back the SAME link instead of
 * minting a second token that would race the one already in the client's
 * WhatsApp.
 */
export async function ensureFormLink(clientId: string, templateId: string): Promise<{ url: string }> {
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("form_submissions")
    .select("token")
    .eq("client_id", clientId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (existing) return { url: formUrl(existing.token as string) };

  const token = randomBytes(24).toString("hex");
  const { error } = await supabase.from("form_submissions").insert({ client_id: clientId, template_id: templateId, token });
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${clientId}`);
  return { url: formUrl(token) };
}

export async function sendFormFromForm(clientId: string, formData: FormData) {
  const templateId = String(formData.get("template_id") ?? "");
  if (!templateId) throw new Error("לא נבחר טופס");

  const { url } = await ensureFormLink(clientId, templateId);
  redirect(`/clients/${clientId}?formLink=${encodeURIComponent(url)}`);
}

// ---------- client-facing submit ----------

/**
 * The token is the ONLY credential: a client at SOP stage 0 has no portal
 * login yet. The client and the template are therefore both resolved from the
 * token server-side and never read from the posted form — accepting a client
 * id here would let anyone holding one valid token write another client's
 * answers.
 */
export async function submitFormFromForm(token: string, formData: FormData) {
  const supabase = supabaseAdmin();

  const { data: row } = await supabase
    .from("form_submissions")
    .select("*, form_templates(id, slug, questions)")
    .eq("token", token)
    .maybeSingle();
  if (!row) throw new Error("קישור לא תקין");

  const submission = row as FormSubmission & { form_templates: Pick<FormTemplate, "id" | "slug" | "questions"> | null };
  const template = submission.form_templates;
  if (!template) throw new Error("הטופס לא נמצא");

  // Read BEFORE the update overwrites it — this distinguishes a first
  // submission from a client coming back to fix a typo.
  const isFirstSubmission = submission.submitted_at === null;

  const { error } = await supabase
    .from("form_submissions")
    .update({
      answers: parseFormAnswersFromFormData(template.questions, formData),
      submitted_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) throw new Error(error.message);

  // Stage 1 is `questionnaire_filled`, trigger "שאלון מולא" — so a first
  // intake submission IS the stage machine's trigger. Routed through
  // advanceStage rather than writing sop_stage directly, to keep the
  // sop_gate_events audit trail consistent with the client named as actor.
  //
  // Guarded three ways on purpose: only the built-in intake form advances
  // anyone (any other form sent to a new client must not), only a first
  // submission counts (a later typo fix must not), and only from stage 0.
  if (isFirstSubmission && template.slug === INTAKE_FORM_SLUG) {
    const { data: client } = await supabase
      .from("clients")
      .select("sop_stage")
      .eq("id", submission.client_id)
      .single();
    if (client && (client.sop_stage as number) === 0) {
      await advanceStage(submission.client_id, "client_intake");
    }
  }

  revalidatePath(`/form/${token}`);
  revalidatePath(`/clients/${submission.client_id}`);
  revalidatePath("/forms");
}
