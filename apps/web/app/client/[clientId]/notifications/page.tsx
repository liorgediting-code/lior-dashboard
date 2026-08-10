import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { PortalTabs } from "@/components/portal-tabs";
import { FollowUpReminders } from "@/components/follow-up-reminders";
import { getPortalTabsData } from "@/lib/crm/portal-tabs-data";
import type { Lead, LeadStatus } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalNotificationsPage({ params }: { params: { clientId: string } }) {
  await requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    supabase.from("leads").select("*").eq("client_id", params.clientId),
    supabase.from("lead_statuses").select("*").eq("client_id", params.clientId),
  ]);
  if (!client) notFound();
  const tabsData = await getPortalTabsData(supabase, params.clientId);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{client.name as string}</h1>
      <PortalTabs clientId={params.clientId} active="notifications" {...tabsData} />
      <FollowUpReminders leads={(leads ?? []) as Lead[]} statuses={(statuses ?? []) as LeadStatus[]} clientId={params.clientId} />
    </div>
  );
}
