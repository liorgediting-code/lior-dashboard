// Hand-written mirror of supabase/migrations/*.sql. Once the Supabase CLI
// is installed, these can be cross-checked (or eventually replaced) with
// `supabase gen types typescript --local`. Keep in sync with the schema.
//
// NOTE: these are `type` aliases, not `interface`s, on purpose — supabase-js
// checks Row/Insert/Update shapes with `extends Record<string, unknown>`,
// and TypeScript only lets object *type aliases* satisfy that check, not
// `interface` declarations (a real TS quirk). Using `interface` here would
// silently make every query resolve to `never`.

export type FunnelStage = "TOFU" | "MOFU" | "BOFU";
export type MissionPriority = "low" | "medium" | "high";
export type MissionStatus = "open" | "in_progress" | "done";
export type LeadStage = "new" | "contacted" | "qualified" | "won" | "lost";
export type GateStatus = "pending" | "approved";
export type KillQueueStatus = "pending" | "approved" | "dismissed";
export type AlertType = "questionnaire_overdue" | "gate_stuck" | "cpl_breach";
export type AlertChannel = "telegram" | "whatsapp";
export type BenchmarkSource = "seed_default" | "learned";
export type CplComputedFrom = "default_table" | "actual_closes";
export type AnalyzerVerdict = "KILL" | "SUSPECT" | "WINNER";

export type Client = {
  id: string;
  name: string;
  business_type: string;
  contact_info: Record<string, unknown>;
  deal_price_avg: number | null;
  close_rate_pct: number | null;
  monthly_revenue: number | null;
  deals_per_month: number | null;
  price_range_low: number | null;
  price_range_high: number | null;
  profit_ratio: number;
  sop_stage: number;
  sop_stage_updated_at: string;
  strategy_call_recording_url: string | null;
  strategy_call_transcript_url: string | null;
  drive_links: DriveLink[];
  crm_password_hash: string | null;
  max_cpl: number | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  created_at: string;
};

export type DriveLink = {
  label: string;
  url: string;
};

export type BaselineSnapshot = {
  id: string;
  client_id: string;
  leads_per_month: number | null;
  avg_cost_per_lead: number | null;
  revenue: number | null;
  close_rate_pct: number | null;
  product_price: number | null;
  cost_per_deal: number | null; // generated column: avg_cost_per_lead / close_rate_pct
  captured_at: string;
};

export type Mission = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: MissionPriority;
  status: MissionStatus;
  created_at: string;
};

export type Campaign = {
  id: string;
  client_id: string;
  meta_id: string | null;
  name: string;
  funnel_stage: FunnelStage | null;
  status: string | null;
};

export type AdSet = {
  id: string;
  campaign_id: string;
  meta_id: string | null;
  name: string;
  funnel_stage: FunnelStage | null;
  status: string | null;
};

export type Ad = {
  id: string;
  adset_id: string;
  meta_id: string | null;
  name: string;
  funnel_stage: FunnelStage | null;
  status: string | null;
};

export type AdMetricDaily = {
  ad_id: string;
  date: string;
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
  cpl: number | null;
};

export type BusinessTypeBenchmark = {
  business_type: string;
  close_rate_estimate: number;
  sample_size: number;
  source: BenchmarkSource;
  updated_at: string;
};

export type CplThresholdHistoryRow = {
  id: string;
  client_id: string;
  max_cpl: number;
  computed_from: CplComputedFrom;
  computed_at: string;
};

export type KillQueueItem = {
  id: string;
  client_id: string;
  entity_type: "ad" | "adset";
  entity_id: string;
  computed_status: "KILL" | "SUSPECT";
  reason: string | null;
  computed_cpl: number | null;
  max_cpl_at_detection: number | null;
  detected_at: string;
  status: KillQueueStatus;
  approved_by: string | null;
  approved_at: string | null;
  meta_action_taken: boolean;
};

export type Lead = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  source_ad_id: string | null;
  stage: LeadStage;
  created_at: string;
  closed_at: string | null;
  deal_value: number | null;
};

export type WeeklyReport = {
  id: string;
  client_id: string;
  week_start: string;
  lead_quality_score: number | null;
  leads_matched_audience: number | null;
  leads_closed_count: number | null;
  report_html: string | null;
  sent_at: string | null;
};

export type SopGate = {
  id: string;
  client_id: string;
  gate_number: 1 | 2 | 3 | 4;
  status: GateStatus;
  approved_at: string | null;
  approved_by: string | null;
};

export type SopGateEvent = {
  id: string;
  client_id: string;
  event_type: string;
  from_stage: number | null;
  to_stage: number | null;
  gate_number: number | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MagicLink = {
  token: string;
  client_id: string;
  gate_number: 1 | 2 | 3 | 4;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type AlertLogRow = {
  id: string;
  client_id: string | null;
  alert_type: AlertType;
  message: string;
  channel: AlertChannel;
  sent_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type SopBottleneck = {
  client_id: string;
  name: string;
  sop_stage: number;
  sop_stage_updated_at: string;
  days_stuck: number;
  gate_number: number | null;
  gate_status: GateStatus | null;
};

export type WhatsappAutomationStep = {
  type: "message" | "wait";
  // message step
  text?: string;
  // wait step
  wait_minutes?: number;
};

export type WhatsappAutomation = {
  id: string;
  client_id: string;
  trigger: string;
  steps: WhatsappAutomationStep[];
  green_api_instance_id: string | null;
};

export type WhatsappAutomationRun = {
  id: string;
  automation_id: string;
  lead_id: string | null;
  current_step_index: number;
  next_action_at: string;
  status: "active" | "completed" | "cancelled";
  created_at: string;
};

export type AiInsight = {
  id: string;
  client_id: string;
  week_start: string | null;
  prompt_input_summary: Record<string, unknown> | null;
  generated_text: string | null;
  model: string | null;
  created_at: string;
};

export type ClientCurrentMetrics = {
  spend: number | null;
  leads_count: number | null;
  closes: number | null;
  avg_cost_per_lead: number | null;
  close_rate_pct: number | null;
  cost_per_deal: number | null;
};
