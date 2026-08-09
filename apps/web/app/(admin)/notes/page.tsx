import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNoteFromForm, updateNoteFromForm, deleteNote } from "@/lib/actions/notes";
import type { Client, Funnel, Note } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; funnel?: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNoteDate(isoDate: string): string {
  // Parsed as UTC midnight on purpose: `note_date` is a bare `date` column, so
  // letting the local timezone shift it could render the previous day.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`block truncate rounded-lg px-2 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
    >
      {label}
    </Link>
  );
}

function NoteFields({
  note,
  clients,
  funnels,
}: {
  note: Note | null;
  clients: Pick<Client, "id" | "name">[];
  funnels: Pick<Funnel, "id" | "name">[];
}) {
  return (
    <>
      <textarea className="input" name="body" rows={3} defaultValue={note?.body ?? ""} placeholder="מה קרה / מה למדנו…" required />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className="input" name="note_date" type="date" defaultValue={note?.note_date ?? todayIso()} />
        <select className="input" name="client_id" defaultValue={note?.client_id ?? ""}>
          <option value="">ללא לקוח</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select className="input" name="funnel_id" defaultValue={note?.funnel_id ?? ""}>
          <option value="">ללא פאנל</option>
          {funnels.map((funnel) => (
            <option key={funnel.id} value={funnel.id}>
              {funnel.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export default async function NotesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = supabaseAdmin();
  const clientFilter = searchParams.client ?? null;
  const funnelFilter = searchParams.funnel ?? null;

  let notesQuery = supabase
    .from("notes")
    .select("*")
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (clientFilter) notesQuery = notesQuery.eq("client_id", clientFilter);
  if (funnelFilter) notesQuery = notesQuery.eq("funnel_id", funnelFilter);

  const [{ data: noteRows }, { data: clientRows }, { data: funnelRows }] = await Promise.all([
    notesQuery,
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("funnels").select("id, name").order("name"),
  ]);

  const notes = (noteRows ?? []) as Note[];
  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  const funnels = (funnelRows ?? []) as Pick<Funnel, "id" | "name">[];

  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const funnelNameById = new Map(funnels.map((funnel) => [funnel.id, funnel.name]));

  // Reverse-chronological feed, grouped under one heading per date.
  const groups: { date: string; notes: Note[] }[] = [];
  for (const note of notes) {
    const last = groups[groups.length - 1];
    if (last && last.date === note.note_date) last.notes.push(note);
    else groups.push({ date: note.note_date, notes: [note] });
  }

  function filterHref(next: Partial<SearchParams>): string {
    const params = new URLSearchParams();
    const client = next.client !== undefined ? next.client : clientFilter;
    const funnel = next.funnel !== undefined ? next.funnel : funnelFilter;
    if (client) params.set("client", client);
    if (funnel) params.set("funnel", funnel);
    const query = params.toString();
    return query ? `/notes?${query}` : "/notes";
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">יומן הערות</h1>
      <p className="mb-6 text-sm text-slate-500">הערות מתוארכות, משויכות ללקוח ו/או לפאנל.</p>

      <div className="flex flex-col gap-6 lg:flex-row-reverse">
        <div className="min-w-0 flex-1">
          <form action={createNoteFromForm} className="card mb-4 space-y-3">
            <NoteFields note={null} clients={clients} funnels={funnels} />
            <button type="submit" className="btn btn-primary">
              + הוסף הערה
            </button>
          </form>

          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.date}>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">{formatNoteDate(group.date)}</h2>
                <div className="space-y-3">
                  {group.notes.map((note) => (
                    <div key={note.id} className="card">
                      <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {note.client_id && <span className="badge badge-neutral">{clientNameById.get(note.client_id) ?? "לקוח שנמחק"}</span>}
                        {note.funnel_id && <span className="badge badge-insufficient">{funnelNameById.get(note.funnel_id) ?? "פאנל שנמחק"}</span>}
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-400">ערוך</summary>
                        <form action={updateNoteFromForm.bind(null, note.id)} className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                          <NoteFields note={note} clients={clients} funnels={funnels} />
                          <button type="submit" className="btn btn-secondary text-xs">
                            שמור
                          </button>
                        </form>
                        <form action={deleteNote.bind(null, note.id)} className="mt-2">
                          <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                            מחק הערה
                          </button>
                        </form>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {notes.length === 0 && (
              <p className="text-slate-500">{clientFilter || funnelFilter ? "אין הערות שתואמות לסינון." : "אין הערות עדיין."}</p>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-56">
          <div className="card space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">לקוח</p>
              <FilterLink href={filterHref({ client: "" })} active={!clientFilter} label="הכל" />
              {clients.map((client) => (
                <FilterLink key={client.id} href={filterHref({ client: client.id })} active={clientFilter === client.id} label={client.name} />
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">פאנל</p>
              <FilterLink href={filterHref({ funnel: "" })} active={!funnelFilter} label="הכל" />
              {funnels.map((funnel) => (
                <FilterLink key={funnel.id} href={filterHref({ funnel: funnel.id })} active={funnelFilter === funnel.id} label={funnel.name} />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
