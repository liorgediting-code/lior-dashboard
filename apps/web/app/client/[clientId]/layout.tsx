import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PortalThemeColor } from "@dashboard-lior/shared";

export default async function ClientPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { clientId: string };
}) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("portal_theme_color").eq("id", params.clientId).maybeSingle();
  const themeColor = (client?.portal_theme_color as PortalThemeColor | null) ?? "blue";

  return (
    <div className="min-h-screen" data-portal-theme={themeColor}>
      <div className="portal-banner py-3 text-center text-sm font-medium">הפורטל האישי שלך · LiorEdits</div>
      <main className="mx-auto max-w-5xl p-6 animate-in">{children}</main>
    </div>
  );
}
