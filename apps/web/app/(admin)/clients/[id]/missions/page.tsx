import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { MissionForm } from "@/components/mission-form";
import { MissionCard } from "@/components/mission-card";
import type { Client, Mission } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientMissionsPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: missions }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("missions").select("*").eq("client_id", params.id).order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  if (!client) notFound();
  const c = client as Pick<Client, "id" | "name">;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{c.name}</h1>
      <ClientTabs clientId={c.id} active="missions" />

      <MissionForm clientId={c.id} />

      <div className="space-y-3">
        {((missions ?? []) as Mission[]).map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
        {(missions ?? []).length === 0 && <p className="text-slate-500">אין משימות עדיין.</p>}
      </div>
    </div>
  );
}
