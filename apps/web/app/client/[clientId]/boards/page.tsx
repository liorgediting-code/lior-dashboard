import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { ClientPortalHeader } from "@/components/client-portal-header";
import { PortalTabs } from "@/components/portal-tabs";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";

export const dynamic = "force-dynamic";

/** The boards the agency assigned to this client (boards.client_id). Elements are not loaded here. */
export default async function ClientPortalBoardsPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, tabsData, { data: boards }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    getPortalTabsData(supabase, params.clientId),
    supabase.from("boards").select("id, name, updated_at").eq("client_id", params.clientId).order("updated_at", { ascending: false }),
  ]);
  if (!client) notFound();

  return (
    <div>
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <PortalTabs clientId={params.clientId} active="boards" {...tabsData} />

      <h1 className="mb-4 text-xl font-bold">לוחות</h1>

      {(boards ?? []).length === 0 ? (
        <p className="text-slate-500">עדיין אין לוחות להצגה.</p>
      ) : (
        <div className="space-y-2">
          {(boards ?? []).map((board) => (
            <Link key={board.id as string} href={`/client/${params.clientId}/boards/${board.id}`} className="card flex items-center justify-between gap-3 hover:shadow-md">
              <span className="min-w-0 truncate font-semibold">{board.name as string}</span>
              <span className="shrink-0 text-xs text-slate-500">עודכן {new Date(board.updated_at as string).toLocaleDateString("he-IL")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
