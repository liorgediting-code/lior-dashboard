import { z } from "zod";
import { getSupabaseClient } from "../supabase-client.js";

export const getQuestionnaireResponsesSchema = {
  client_id: z.string().uuid().optional(),
  /** How many of the most recent weeks to return per query. */
  limit: z.number().int().min(1).max(52).optional(),
};

type QuestionRow = { id: string; label: string; type: string; required: boolean };

/**
 * Weekly questionnaire answers, with each answer paired back to its question
 * text. Answers are stored keyed by question id, so on their own they're
 * unreadable — this resolves the client's effective template (their override
 * if any, else the global one) and labels every answer.
 */
export async function getQuestionnaireResponses({ client_id, limit }: { client_id?: string; limit?: number }) {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("questionnaire_responses")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(limit ?? 12);
  if (client_id) query = query.eq("client_id", client_id);

  const [{ data: responses, error }, { data: templates }, { data: clients }] = await Promise.all([
    query,
    supabase.from("questionnaire_templates").select("*"),
    supabase.from("clients").select("id, name"),
  ]);
  if (error) throw new Error(error.message);

  const globalTemplate = (templates ?? []).find((t) => t.client_id === null) ?? null;
  const overrideByClient = new Map((templates ?? []).filter((t) => t.client_id !== null).map((t) => [t.client_id as string, t]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));

  return {
    responses: (responses ?? []).map((response) => {
      const template = overrideByClient.get(response.client_id as string) ?? globalTemplate;
      const questions = (template?.questions ?? []) as QuestionRow[];
      const answers = (response.answers ?? {}) as Record<string, string | number | null>;

      return {
        client_id: response.client_id,
        client_name: clientNameById.get(response.client_id as string) ?? null,
        week_start: response.week_start,
        submitted_at: response.submitted_at,
        answers: questions.map((question) => ({
          question: question.label,
          type: question.type,
          answer: answers[question.id] ?? null,
        })),
        // Kept so an answer whose question was later deleted from the template
        // is still visible to whoever is analyzing the data.
        raw_answers: answers,
      };
    }),
  };
}
