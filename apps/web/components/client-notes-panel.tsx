import Link from "next/link";
import { createNoteFromForm, deleteNote, updateNoteFromForm } from "@/lib/actions/notes";
import type { Note } from "@dashboard-lior/shared";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNoteDate(isoDate: string): string {
  // Parsed as UTC midnight on purpose: `note_date` is a bare `date` column, so
  // letting the local timezone shift it could render the previous day.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The per-client activity log — quick capture while you're looking at the
 * client, without leaving for /notes.
 *
 * Writes go through the same actions as the global feed, with client_id
 * pinned by a hidden input, so a note logged here shows up there too.
 */
export function ClientNotesPanel({ clientId, notes }: { clientId: string; notes: Note[] }) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">יומן הערות</h2>
        <Link href={`/notes?client=${clientId}`} className="text-xs text-slate-400 hover:text-slate-700">
          ליומן המלא
        </Link>
      </div>

      <form action={createNoteFromForm} className="mb-4 space-y-2">
        <input type="hidden" name="client_id" value={clientId} />
        <textarea className="input" name="body" rows={3} placeholder="מה קרה היום / מה למדנו…" required />
        <div className="flex gap-2">
          <input className="input" name="note_date" type="date" defaultValue={todayIso()} />
          <button type="submit" className="btn btn-primary whitespace-nowrap">
            + תעד
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {notes.map((note) => (
          <div key={note.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
            <p className="text-xs text-slate-400">{formatNoteDate(note.note_date)}</p>
            <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-400">ערוך</summary>
              <form action={updateNoteFromForm.bind(null, note.id)} className="mt-2 space-y-2">
                {/* Re-posted unchanged: the shared action treats a missing
                    field as "clear it", so omitting these would detach the
                    note from this client on every edit. */}
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="funnel_id" value={note.funnel_id ?? ""} />
                <textarea className="input" name="body" rows={3} defaultValue={note.body} required />
                <div className="flex gap-2">
                  <input className="input" name="note_date" type="date" defaultValue={note.note_date} />
                  <button type="submit" className="btn btn-secondary whitespace-nowrap text-xs">
                    שמור
                  </button>
                </div>
              </form>
              <form action={deleteNote.bind(null, note.id)} className="mt-2">
                <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                  מחק
                </button>
              </form>
            </details>
          </div>
        ))}

        {notes.length === 0 && <p className="text-sm text-slate-500">אין עדיין הערות על הלקוח הזה.</p>}
      </div>
    </div>
  );
}
