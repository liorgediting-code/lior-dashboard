import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WebhookFieldMapping } from "@dashboard-lior/shared";
import { applyFieldMappings, type MappedLead } from "./webhook-mapping";

/**
 * Loads a client's mapping config and returns a ready-to-use translator.
 *
 * Both lead webhooks call this, so a key mapped once behaves the same whether
 * the lead arrives from Meta or from a Zapier/Make automation.
 */
export async function loadFieldMapper(clientId: string): Promise<(payload: Record<string, unknown>) => MappedLead> {
  const supabase = supabaseAdmin();
  const [{ data: mappingRows }, { data: columnRows }] = await Promise.all([
    supabase.from("webhook_field_mappings").select("source_key, target").eq("client_id", clientId),
    supabase.from("lead_columns").select("id").eq("client_id", clientId),
  ]);

  const mappings = (mappingRows ?? []) as Pick<WebhookFieldMapping, "source_key" | "target">[];
  const columnIds = new Set(((columnRows ?? []) as { id: string }[]).map((column) => column.id));

  return (payload) => applyFieldMappings(payload, mappings, columnIds);
}
