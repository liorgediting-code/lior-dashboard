import { createMission } from "@/lib/actions/missions";

async function createMissionAction(clientId: string, formData: FormData) {
  "use server";
  await createMission({
    client_id: clientId,
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    due_date: String(formData.get("due_date") ?? "") || null,
    priority: (formData.get("priority") as "low" | "medium" | "high") ?? "medium",
  });
}

export function MissionForm({ clientId }: { clientId: string }) {
  return (
    <form action={createMissionAction.bind(null, clientId)} className="card mb-4 space-y-3">
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
  );
}
