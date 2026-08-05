"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

function revalidatePayments(clientId: string) {
  revalidatePath(`/clients/${clientId}/edit`);
  revalidatePath("/goals");
}

export async function createClientPaymentFromForm(clientId: string, formData: FormData) {
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("client_payments").insert({
    client_id: clientId,
    amount,
    paid_on: String(formData.get("paid_on") ?? "") || new Date().toISOString().slice(0, 10),
    note: String(formData.get("note") ?? "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePayments(clientId);
}

export async function deleteClientPayment(paymentId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("client_payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  revalidatePayments(clientId);
}
