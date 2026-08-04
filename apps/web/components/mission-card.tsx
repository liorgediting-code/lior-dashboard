import { updateMissionStatus } from "@/lib/actions/missions";
import type { Mission, MissionStatus } from "@dashboard-lior/shared";

const STATUS_LABEL: Record<MissionStatus, string> = { open: "פתוח", in_progress: "בתהליך", done: "בוצע" };
const PRIORITY_LABEL: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה" };
const PRIORITY_CLASS: Record<string, string> = { low: "badge-insufficient", medium: "badge-suspect", high: "badge-kill" };

export function MissionCard({ mission, clientName }: { mission: Mission; clientName?: string }) {
  const statuses: MissionStatus[] = ["open", "in_progress", "done"];

  return (
    <div className="card flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{mission.title}</p>
        {mission.description && <p className="text-sm text-slate-500">{mission.description}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          {clientName && <span>{clientName}</span>}
          {mission.due_date && <span>יעד: {mission.due_date}</span>}
          <span className={`badge ${PRIORITY_CLASS[mission.priority]}`}>{PRIORITY_LABEL[mission.priority]}</span>
        </div>
      </div>
      <div className="flex gap-1">
        {statuses.map((status) => (
          <form key={status} action={updateMissionStatus.bind(null, mission.id, status)}>
            <button
              type="submit"
              disabled={mission.status === status}
              className={`btn text-xs ${mission.status === status ? "btn-primary" : "btn-secondary"}`}
            >
              {STATUS_LABEL[status]}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
