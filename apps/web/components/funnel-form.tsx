import { DriveLinksEditor } from "@/components/drive-links-editor";
import type { Client, DriveLink, Funnel, FunnelStage, FunnelStatus } from "@dashboard-lior/shared";

export type CampaignOption = {
  id: string;
  name: string;
  clientName: string;
};

const STAGE_OPTIONS: { value: FunnelStage | ""; label: string }[] = [
  { value: "", label: "ללא שלב" },
  { value: "TOFU", label: "TOFU — מודעות" },
  { value: "MOFU", label: "MOFU — שקילה" },
  { value: "BOFU", label: "BOFU — סגירה" },
];

const STATUS_OPTIONS: { value: FunnelStatus; label: string }[] = [
  { value: "active", label: "פעיל" },
  { value: "paused", label: "מושהה" },
  { value: "archived", label: "בארכיון" },
];

/**
 * Shared by the create form and each funnel's edit form. `funnel` is null when
 * creating. Rendered on the server — the only client island is
 * DriveLinksEditor, which posts its rows as JSON in a hidden input.
 */
export function FunnelForm({
  action,
  funnel,
  clients,
  campaigns,
  selectedCampaignIds,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  funnel: Funnel | null;
  clients: Pick<Client, "id" | "name">[];
  campaigns: CampaignOption[];
  selectedCampaignIds: string[];
  submitLabel: string;
}) {
  const selected = new Set(selectedCampaignIds);
  const driveLinks: DriveLink[] = funnel?.drive_links ?? [];

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">שם הפאנל *</label>
          <input className="input" name="name" defaultValue={funnel?.name ?? ""} placeholder="למשל: פאנל ליווי אישי" required />
        </div>
        <div>
          <label className="label">לקוח משויך</label>
          <select className="input" name="client_id" defaultValue={funnel?.client_id ?? ""}>
            <option value="">ללא — פאנל של הסוכנות</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">שלב</label>
          <select className="input" name="stage" defaultValue={funnel?.stage ?? ""}>
            {STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">סטטוס</label>
          <select className="input" name="status" defaultValue={funnel?.status ?? "active"}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">תיאור / מה עובד</label>
        <textarea className="input" name="description" rows={3} defaultValue={funnel?.description ?? ""} placeholder="מבנה הפאנל, מה עובד, מה לשפר…" />
      </div>

      <div>
        <label className="label">קמפיינים שמזינים את הפאנל</label>
        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-500">אין קמפיינים מסונכרנים עדיין.</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {campaigns.map((campaign) => (
              <label key={campaign.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                <input type="checkbox" name="campaign_ids" value={campaign.id} defaultChecked={selected.has(campaign.id)} />
                <span>{campaign.name}</span>
                <span className="text-xs text-slate-400">({campaign.clientName})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">חומרים / קישורי דרייב</label>
        <DriveLinksEditor name="drive_links" defaultValue={driveLinks} />
      </div>

      <button type="submit" className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
