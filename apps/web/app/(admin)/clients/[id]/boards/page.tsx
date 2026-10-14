import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase/schema-state";
import { createBoardFromForm } from "@/lib/actions/boards";
import { ClientTabs } from "@/components/client-tabs";
import { BoardImportButton } from "@/components/drawboard/board-import-button";
import type { Board } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

type BoardRow = Omit<Board, "elements">;

export default async function ClientBoardsPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: boardRows, error }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("boards").select("id, name, client_id, created_at, updated_at").eq("client_id", params.id).order("updated_at", { ascending: false }),
  ]);
  if (!client) notFound();
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);

  const boards = (boardRows ?? []) as BoardRow[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="boards" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={createBoardFromForm} className="flex items-center gap-2">
          <input type="hidden" name="client_id" value={params.id} />
          <input className="input w-64" name="name" placeholder="שם לוח חדש ללקוח" required />
          <button className="btn btn-primary">לוח חדש</button>
        </form>
        <BoardImportButton clientId={params.id} />
        <Link href="/boards" className="btn btn-secondary ms-auto">שייך לוח קיים</Link>
      </div>

      {boards.length === 0 ? (
        <p className="text-sm text-slate-500">אין לוחות משויכים ללקוח הזה. צור לוח חדש, או שייך לוח קיים מעמוד הלוחות.</p>
      ) : (
        <div className="space-y-2">
          {boards.map((board) => (
            <div key={board.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/boards/${board.id}?from=client`} className="block truncate font-semibold hover:text-blue-700">{board.name}</Link>
                <div className="text-xs text-slate-500">עודכן {new Date(board.updated_at).toLocaleString("he-IL")}</div>
              </div>
              <Link href={`/boards/${board.id}?from=client`} className="btn btn-secondary">פתח / ערוך</Link>
              <Link href={`/boards/${board.id}?from=client&present=1`} className="btn btn-primary">הצג ▶</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
