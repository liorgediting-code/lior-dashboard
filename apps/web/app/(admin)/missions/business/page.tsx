import { supabaseAdmin } from "@/lib/supabase/admin";
import { MissionCard } from "@/components/mission-card";
import { MissionsTabs } from "@/components/missions-tabs";
import { createBusinessMissionFromForm } from "@/lib/actions/missions";
import type { Mission } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function BusinessTasksPage() {
  const supabase = supabaseAdmin();
  const { data: missions } = await supabase
    .from("missions")
    .select("*")
    .is("client_id", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">משימות</h1>
      <MissionsTabs active="business" />

      <form action={createBusinessMissionFromForm} className="card mb-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <input className="input" name="title" placeholder="כותרת המשימה" required />
          <input className="input" name="due_date" type="date" />
          <select className="input" name="priority" defaultValue="medium">
            <option value="low">עדיפות נמוכה</option>
            <option value="medium">עדיפות בינונית</option>
            <option value="high">עדיפות גבוהה</option>
          </select>
        </div>
        <textarea className="input" name="description" placeholder="תיאור (אופציונלי)" rows={2} />
        <button type="submit" className="btn btn-primary">
          + הוסף משימה
        </button>
      </form>

      <div className="space-y-3">
        {((missions ?? []) as Mission[]).map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
        {(missions ?? []).length === 0 && <p className="text-slate-500">אין משימות לעסק עדיין.</p>}
      </div>
    </div>
  );
}
