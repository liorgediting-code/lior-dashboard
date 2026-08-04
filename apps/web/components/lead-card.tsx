import { updateLeadStage } from "@/lib/actions/leads";
import type { Lead, LeadStage } from "@dashboard-lior/shared";

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "חדש",
  contacted: "נוצר קשר",
  qualified: "מוכשר",
  won: "נסגר",
  lost: "אבוד",
};

const STAGES: LeadStage[] = ["new", "contacted", "qualified", "won", "lost"];

async function moveLeadStageAction(leadId: string, clientId: string, stage: LeadStage) {
  "use server";
  await updateLeadStage(leadId, clientId, stage);
}

export function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="card space-y-2">
      <p className="font-medium">{lead.name ?? "ליד ללא שם"}</p>
      {lead.phone && <p className="text-sm text-slate-500">{lead.phone}</p>}
      {lead.deal_value != null && <p className="text-sm text-green-700">שווי עסקה: ₪{lead.deal_value}</p>}
      <div className="flex flex-wrap gap-1">
        {STAGES.map((stage) => (
          <form key={stage} action={moveLeadStageAction.bind(null, lead.id, lead.client_id, stage)}>
            <button
              type="submit"
              disabled={lead.stage === stage}
              className={`btn text-xs ${lead.stage === stage ? "btn-primary" : "btn-secondary"}`}
            >
              {STAGE_LABEL[stage]}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
