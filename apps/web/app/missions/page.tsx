import { supabaseAdmin } from "@/lib/supabase/admin";
import { MissionCard } from "@/components/mission-card";
import { MissionsTabs } from "@/components/missions-tabs";
import type { Mission } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function GlobalMissionsPage() {
  const supabase = supabaseAdmin();
  const { data: missions } = await supabase
    .from("missions")
    .select("*, clients(name)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">משימות</h1>
      <MissionsTabs active="clients" />
      <div className="space-y-3">
        {((missions ?? []) as Array<Mission & { clients: { name: string } | null }>).map((mission) => (
          <MissionCard key={mission.id} mission={mission} clientName={mission.clients?.name} />
        ))}
        {(missions ?? []).length === 0 && <p className="text-slate-500">אין משימות עדיין.</p>}
      </div>
    </div>
  );
}
