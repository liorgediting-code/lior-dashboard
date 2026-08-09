import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { PortalTabs } from "@/components/portal-tabs";
import { WhatsappAutomationEditor } from "@/components/whatsapp-automation-editor";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import type { WhatsappAutomation } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalAutomationsPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: automations }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    supabase.from("whatsapp_automations").select("*").eq("client_id", params.clientId),
  ]);
  if (!client) notFound();
  const tabsData = await getPortalTabsData(supabase, params.clientId);
  const automationRows = (automations ?? []) as WhatsappAutomation[];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{client.name as string}</h1>
      <PortalTabs
        clientId={params.clientId}
        active="automations"
        notificationsCount={tabsData.notificationsCount}
        showAutomations={tabsData.showAutomations}
      />
      <div className="space-y-3">
        {automationRows.map((automation) => (
          <WhatsappAutomationEditor key={automation.id} automation={automation} clientId={params.clientId} />
        ))}
        {automationRows.length === 0 && <p className="text-slate-500">אין עדיין אוטומציית WhatsApp מוגדרת עבורך.</p>}
      </div>
    </div>
  );
}
