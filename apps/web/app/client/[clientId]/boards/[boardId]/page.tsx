import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { BoardViewerLoader } from "@/components/drawboard/board-viewer-loader";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import type { El } from "@/components/drawboard/types";

export const dynamic = "force-dynamic";

/**
 * One board, read-only. The query scopes by client_id as well as the board id,
 * so a client can never open another client's board by editing the URL.
 */
export default async function ClientPortalBoardPage({ params }: { params: { clientId: string; boardId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, tabsData, { data: board }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    getPortalTabsData(supabase, params.clientId),
    supabase.from("boards").select("id, name, elements").eq("id", params.boardId).eq("client_id", params.clientId).maybeSingle(),
  ]);
  if (!client || !board) notFound();

  return (
    <div>
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <PortalTabs clientId={params.clientId} active="boards" {...tabsData} />

      <Link href={`/client/${params.clientId}/boards`} className="mb-3 inline-block text-sm text-blue-700 underline">
        ← חזרה ללוחות
      </Link>
      <div className="h-[75vh] overflow-hidden rounded-xl border">
        <BoardViewerLoader name={board.name as string} elements={board.elements as El[]} />
      </div>
    </div>
  );
}
