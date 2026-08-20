// Pure helpers over the raw `campaigns.status` / `adsets.status` /
// `ads.status` text column. Deliberately free of `server-only` and of any
// Supabase import so it can be unit-tested — same split as
// ./campaign-stats.ts.
//
// The column has NO check constraint (unlike funnel_stage), and it holds
// Meta's `effective_status` verbatim: ACTIVE, PAUSED, ARCHIVED, DELETED,
// plus review states like PENDING_REVIEW / DISAPPROVED / IN_PROCESS. Never
// compare it with `status === "active"` — case and vocabulary both differ.

/** The only two buckets the UI filters on: running, or not running. */
export type CampaignActivity = "active" | "inactive";

export const CAMPAIGN_ACTIVITY_LABELS: Record<CampaignActivity, string> = {
  active: "פעיל",
  inactive: "לא פעיל",
};

/**
 * Everything that is not exactly ACTIVE — including `null`, which is what a
 * row synced before status was tracked looks like — counts as inactive. A
 * campaign in PENDING_REVIEW is genuinely not spending, so grouping it with
 * paused is the honest answer rather than a third bucket nobody acts on.
 */
export function campaignActivity(status: string | null | undefined): CampaignActivity {
  return String(status ?? "").trim().toUpperCase() === "ACTIVE" ? "active" : "inactive";
}

export function isCampaignActive(status: string | null | undefined): boolean {
  return campaignActivity(status) === "active";
}

/** Human-facing rendering of the raw value, for the status column. */
export function formatCampaignStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (raw === "") return "—";
  const known: Record<string, string> = {
    ACTIVE: "פעיל",
    PAUSED: "מושהה",
    ARCHIVED: "בארכיון",
    DELETED: "נמחק",
    PENDING_REVIEW: "בבדיקה",
    DISAPPROVED: "נדחה",
    IN_PROCESS: "בתהליך",
    WITH_ISSUES: "עם בעיות",
  };
  return known[raw.toUpperCase()] ?? raw;
}
