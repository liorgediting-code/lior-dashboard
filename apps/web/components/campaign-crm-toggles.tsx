"use client";

import { useState, useTransition } from "react";
import { setCampaignCrmVisibility, type CrmSurface } from "@/lib/actions/campaigns";

function Toggle({
  campaignId,
  surface,
  initial,
  label,
  title,
}: {
  campaignId: string;
  surface: CrmSurface;
  initial: boolean;
  label: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Optimistic local state: the server action revalidates the page, but the
  // checkbox must not visibly snap back to its old value while that round
  // trip is in flight.
  const [checked, setChecked] = useState(initial);

  return (
    <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs" title={title}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-600"
        checked={checked}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          startTransition(async () => {
            try {
              await setCampaignCrmVisibility(campaignId, surface, next);
            } catch (err) {
              setChecked(!next);
              alert(err instanceof Error ? err.message : "השינוי נכשל");
            }
          });
        }}
      />
      <span className={isPending ? "text-slate-400" : "text-slate-600"}>{label}</span>
    </label>
  );
}

/** The "attach this campaign to a CRM" control, one checkbox per destination. */
export function CampaignCrmToggles({
  campaignId,
  clientName,
  showInAgencyCrm,
  showInClientCrm,
}: {
  campaignId: string;
  clientName: string;
  showInAgencyCrm: boolean;
  showInClientCrm: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Toggle
        campaignId={campaignId}
        surface="agency"
        initial={showInAgencyCrm}
        label="ה-CRM שלי"
        title="הצג את דשבורד הקמפיין ב-CRM של הסוכנות"
      />
      <Toggle
        campaignId={campaignId}
        surface="client"
        initial={showInClientCrm}
        label="CRM הלקוח"
        title={`הצג את דשבורד הקמפיין ב-CRM של ${clientName} — כולל בפורטל שהלקוח רואה`}
      />
    </div>
  );
}
