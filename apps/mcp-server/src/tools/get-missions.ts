import { z } from "zod";
import { getSupabaseClient } from "../supabase-client.js";

export const getMissionsSchema = {
  client_id: z.string().uuid().optional(),
  overdue_only: z.boolean().optional(),
};

export async function getMissions({ client_id, overdue_only }: { client_id?: string; overdue_only?: boolean }) {
  const supabase = getSupabaseClient();
  let query = supabase.from("missions").select("*, clients(name)").order("due_date", { ascending: true, nullsFirst: false });

  if (client_id) query = query.eq("client_id", client_id);
  if (overdue_only) query = query.lt("due_date", new Date().toISOString().slice(0, 10)).neq("status", "done");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { missions: data ?? [] };
}
