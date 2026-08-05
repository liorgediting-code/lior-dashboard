import { supabaseAdmin } from "@/lib/supabase/admin";
import { MissionsTabs } from "@/components/missions-tabs";
import { createDailyTaskFromForm, archiveDailyTask, toggleDailyTaskToday } from "@/lib/actions/daily-tasks";
import type { DailyTask, DailyTaskCompletion } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function BusinessTasksPage() {
  const supabase = supabaseAdmin();
  const completedOn = todayIso();

  const { data: tasks } = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const taskRows = (tasks ?? []) as DailyTask[];
  const taskIds = taskRows.map((t) => t.id);

  const { data: completions } = taskIds.length
    ? await supabase.from("daily_task_completions").select("*").in("daily_task_id", taskIds).eq("completed_on", completedOn)
    : { data: [] as DailyTaskCompletion[] };

  const completedTaskIds = new Set(((completions ?? []) as DailyTaskCompletion[]).map((c) => c.daily_task_id));
  const completionPct = taskRows.length > 0 ? Math.round((completedTaskIds.size / taskRows.length) * 100) : null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">משימות</h1>
      <MissionsTabs active="business" />

      <div className="card mb-6">
        <p className="text-sm text-slate-500">אחוז השלמה יומי</p>
        <p className="text-2xl font-bold">{completionPct != null ? `${completionPct}%` : "—"}</p>
      </div>

      <div className="space-y-2">
        {taskRows.map((task) => {
          const done = completedTaskIds.has(task.id);
          return (
            <div key={task.id} className="card flex items-center justify-between gap-4">
              <label className="flex flex-1 items-center gap-3">
                <form action={toggleDailyTaskToday.bind(null, task.id)}>
                  <button
                    type="submit"
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${
                      done ? "border-green-600 bg-green-600 text-white" : "border-slate-300 text-transparent"
                    }`}
                    aria-label={done ? "בוצע היום" : "לא בוצע היום"}
                  >
                    ✓
                  </button>
                </form>
                <span className={done ? "text-slate-400 line-through" : ""}>{task.title}</span>
              </label>
              <form action={archiveDailyTask.bind(null, task.id)}>
                <button type="submit" className="btn btn-secondary text-xs">
                  הסר
                </button>
              </form>
            </div>
          );
        })}
        {taskRows.length === 0 && <p className="text-slate-500">אין עדיין משימות יומיות.</p>}
      </div>

      <form action={createDailyTaskFromForm} className="card mt-4 flex flex-wrap gap-2">
        <input className="input flex-1" name="title" placeholder="משימה יומית חדשה" required />
        <button type="submit" className="btn btn-primary">
          + הוסף
        </button>
      </form>
    </div>
  );
}
