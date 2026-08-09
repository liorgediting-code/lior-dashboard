import { supabaseAdmin } from "@/lib/supabase/admin";
import { approveKillQueueItem, dismissKillQueueItem } from "@/lib/analyzer/approve-kill";
import { formatCurrency } from "@/lib/format";
import { redirect } from "next/navigation";
import type { KillQueueItem } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

async function approveAction(id: string) {
  "use server";
  await approveKillQueueItem(id);
  redirect("/kill-queue");
}

async function dismissAction(id: string) {
  "use server";
  await dismissKillQueueItem(id);
  redirect("/kill-queue");
}

export default async function KillQueuePage() {
  const supabase = supabaseAdmin();
  const { data: items } = await supabase
    .from("kill_queue_items")
    .select("*, clients(name)")
    .eq("status", "pending")
    .order("detected_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">תור הריגה</h1>
      <p className="mb-6 text-sm text-slate-500">
        אישור ידני בלבד — המערכת לעולם לא עוצרת מודעות ב-Meta אוטומטית. אחרי אישור, יש לעצור את המודעה ידנית ב-Meta Ads Manager.
      </p>

      <div className="space-y-3">
        {((items ?? []) as Array<KillQueueItem & { clients: { name: string } | null }>).map((item) => (
          <div key={item.id} className="card flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">
                {item.clients?.name} · {item.entity_type === "ad" ? "מודעה" : "סט מודעות"}
              </p>
              <p className="text-sm text-slate-500">{item.reason}</p>
              <p className="text-xs text-slate-400">
                CPL: {formatCurrency(item.computed_cpl)} · max_CPL בזמן הזיהוי: {formatCurrency(item.max_cpl_at_detection)}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={dismissAction.bind(null, item.id)}>
                <button type="submit" className="btn btn-secondary">
                  בטל
                </button>
              </form>
              <form action={approveAction.bind(null, item.id)}>
                <button type="submit" className="btn btn-danger">
                  אשר עצירה
                </button>
              </form>
            </div>
          </div>
        ))}
        {(items ?? []).length === 0 && <p className="text-slate-500">אין פריטים בתור.</p>}
      </div>
    </div>
  );
}
