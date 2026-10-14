import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase/schema-state";
import { createBoardFromForm, deleteBoard, setBoardClientFromForm } from "@/lib/actions/boards";
import { BoardImportButton } from "@/components/drawboard/board-import-button";
import type { Board, Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

type BoardRow = Omit<Board, "elements">;

export default async function BoardsPage() {
  const supabase = supabaseAdmin();
  // `elements` can be megabytes (inlined images) — the list doesn't need it.
  const [{ data: boardRows, error }, { data: clientRows }] = await Promise.all([
    supabase.from("boards").select("id, name, client_id, created_at, updated_at").order("updated_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  if (isMissingSchemaError(error)) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">לוחות</h1>
        <div className="card text-sm text-slate-600">טבלת הלוחות עדיין לא קיימת — צריך להריץ את מיגרציה phase26_boards.</div>
      </div>
    );
  }
  if (error) throw new Error(error.message);

  const boards = (boardRows ?? []) as BoardRow[];
  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">לוחות</h1>
        <BoardImportButton />
      </div>

      <form action={createBoardFromForm} className="card mb-6 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_16rem_auto]">
        <input className="input" name="name" placeholder="שם הלוח (למשל: הצעה ללקוח, פאנל מכירה)" required />
        <select className="input" name="client_id" defaultValue="">
          <option value="">ללא לקוח</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn btn-primary">לוח חדש</button>
      </form>

      {boards.length === 0 ? (
        <p className="text-sm text-slate-500">אין לוחות עדיין.</p>
      ) : (
        <div className="space-y-2">
          {boards.map((board) => (
            <div key={board.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/boards/${board.id}`} className="block truncate font-semibold hover:text-blue-700">{board.name}</Link>
                <div className="text-xs text-slate-500">
                  {board.client_id ? clientName.get(board.client_id) ?? "לקוח" : "ללא לקוח"} · עודכן {new Date(board.updated_at).toLocaleString("he-IL")}
                </div>
              </div>
              <form action={setBoardClientFromForm.bind(null, board.id)} className="flex items-center gap-1">
                <select className="input w-44" name="client_id" defaultValue={board.client_id ?? ""}>
                  <option value="">ללא לקוח</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button className="btn btn-secondary">שייך</button>
              </form>
              <Link href={`/boards/${board.id}`} className="btn btn-secondary">פתח / ערוך</Link>
              <Link href={`/boards/${board.id}?present=1`} className="btn btn-primary">הצג ▶</Link>
              <form action={deleteBoard.bind(null, board.id)}>
                <button className="btn btn-danger">מחק</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
