import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BoardEditorLoader } from "@/components/drawboard/board-editor-loader";
import type { El } from "@/components/drawboard/types";
import type { Board, Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { present?: string; from?: string };
}) {
  const supabase = supabaseAdmin();
  const [{ data: boardRow }, { data: clientRows }] = await Promise.all([
    supabase.from("boards").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  if (!boardRow) notFound();

  const board = boardRow as Board;
  const clients = (clientRows ?? []) as Pick<Client, "id" | "name">[];
  // Coming from a client's tab goes back to that tab; otherwise the global list.
  const backHref = searchParams.from === "client" && board.client_id ? `/clients/${board.client_id}/boards` : "/boards";

  return (
    // The admin layout pads <main> by p-6; the editor wants the full viewport.
    <div className="-m-6 h-screen">
      <BoardEditorLoader
        boardId={board.id}
        initialName={board.name}
        initialClientId={board.client_id}
        initialElements={board.elements as El[]}
        clients={clients}
        autoPresent={searchParams.present === "1"}
        backHref={backHref}
      />
    </div>
  );
}
