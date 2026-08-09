import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, QuestionnaireTemplate } from "@dashboard-lior/shared";

// Pure date/question helpers live in ./questionnaire-week.ts (no `server-only`,
// so they're unit-testable) and are re-exported here so callers have one import.
export { weekStartIso, formatWeekRange, normalizeQuestions } from "./questionnaire-week";

/**
 * The template a given client should see: their own override if one exists,
 * otherwise the single global template (client_id is null). Returns null only
 * if the global seed row was deleted.
 */
export async function resolveTemplateForClient(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<QuestionnaireTemplate | null> {
  const [{ data: override }, { data: global }] = await Promise.all([
    supabase.from("questionnaire_templates").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("questionnaire_templates").select("*").is("client_id", null).maybeSingle(),
  ]);

  return ((override ?? global) as QuestionnaireTemplate | null) ?? null;
}
