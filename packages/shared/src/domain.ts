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
  webhook_secret: string | null;
  /** Google Drive folder holding this client's ad videos (phase 20b). */
  drive_folder_id: string | null;
  /** Set when the client clicks "forgot password" on their login page; cleared once the agency regenerates it (phase 21). */
  password_reset_requested_at: string | null;
  /** Order + visibility of the CRM table's columns, built-in and custom together. Null = default order, nothing hidden (phase 21b). */
  crm_column_layout: CrmColumnLayoutEntry[] | null;
  created_at: string;
};

/** `key` is one of BUILT_IN_CRM_COLUMN_KEYS or a lead_columns.id — see lib/crm/column-layout.ts. */
export type CrmColumnLayoutEntry = {
  key: string;
  hidden: boolean;
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
  client_id: string | null;
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
  email: string | null;
  source_ad_id: string | null;
  status_id: string;
  custom_fields: Record<string, string | number>;
  meta_leadgen_id: string | null;
  follow_up_at: string | null;
  created_at: string;
  closed_at: string | null;
  deal_value: number | null;
};

export type LeadActivityKind = "call" | "whatsapp" | "note";

export type LeadActivity = {
  id: string;
  lead_id: string;
  client_id: string;
  kind: LeadActivityKind;
  note: string;
  created_at: string;
};

export type LeadStatusKind = "open" | "won" | "lost";

export type LeadStatus = {
  id: string;
  client_id: string;
  label: string;
  kind: LeadStatusKind;
  sort_order: number;
  is_default: boolean;
};

export type LeadColumnType = "text" | "number";

export type LeadColumn = {
  id: string;
  client_id: string;
  name: string;
  type: LeadColumnType;
  sort_order: number;
};

export type ReportPeriodKind = "week" | "month";

export type WeeklyReport = {
  id: string;
  client_id: string;
  /** First day of the reported period — Sunday for a week, the 1st for a month. */
  week_start: string;
  lead_quality_score: number | null;
  leads_matched_audience: number | null;
  leads_closed_count: number | null;
  report_html: string | null;
  sent_at: string | null;
  period_kind: ReportPeriodKind;
  /** Last day of the period, inclusive. Null on rows written before phase 19. */
  period_end: string | null;
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

export type DailyTask = {
  id: string;
  title: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type DailyTaskCompletion = {
  id: string;
  daily_task_id: string;
  completed_on: string;
  created_at: string;
};

export type ClientPayment = {
  id: string;
  client_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
};

export type GoalMetric = "client_count" | "revenue" | "leads_count";

export type Goal = {
  id: string;
  metric: GoalMetric;
  target_value: number;
  created_at: string;
};

export type AppSettings = {
  id: number;
  meta_system_user_token: string | null;
  meta_business_id: string | null;
  updated_at: string;
};

// --- Phase 15: the agency's own CRM (separate from per-client `leads`) ---

export type AgencyLeadStatus = "new" | "contacted" | "meeting" | "proposal" | "won" | "lost";

export type AgencyLead = {
  id: string;
  name: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: AgencyLeadStatus;
  deal_value: number | null;
  notes: string | null;
  follow_up_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

// --- Phase 16: funnels ---

export type FunnelStatus = "active" | "paused" | "archived";

export type Funnel = {
  id: string;
  name: string;
  stage: FunnelStage | null;
  status: FunnelStatus;
  client_id: string | null;
  description: string | null;
  drive_links: DriveLink[];
  created_at: string;
  updated_at: string;
};

export type FunnelCampaign = {
  funnel_id: string;
  campaign_id: string;
  created_at: string;
};

// --- Phase 17: notes feed ---

export type Note = {
  id: string;
  body: string;
  note_date: string;
  client_id: string | null;
  funnel_id: string | null;
  created_at: string;
  updated_at: string;
};

// --- Phase 18 (roadmap 2c): weekly campaign questionnaire ---

export type QuestionnaireQuestionType = "text" | "textarea" | "number" | "rating";

export type QuestionnaireQuestion = {
  id: string;
  label: string;
  type: QuestionnaireQuestionType;
  required: boolean;
};

export type QuestionnaireTemplate = {
  id: string;
  /** null = the global default template every client falls back to. */
  client_id: string | null;
  name: string;
  questions: QuestionnaireQuestion[];
  created_at: string;
  updated_at: string;
};

// --- Phase 19: configurable webhook field mapping ---

/**
 * Where an incoming webhook key should land. Either a built-in lead field,
 * the explicit "throw it away" marker, or a lead_columns.id (a custom CRM
 * column) — see the phase-19 migration for why this isn't a foreign key.
 */
export type WebhookFieldTarget = "name" | "phone" | "email" | "ignore" | (string & {});

export type WebhookFieldMapping = {
  id: string;
  client_id: string;
  /** The key as it arrives in the webhook payload. Matched case-insensitively. */
  source_key: string;
  target: WebhookFieldTarget;
  created_at: string;
};

export type QuestionnaireResponse = {
  id: string;
  client_id: string;
  template_id: string | null;
  /** Sunday of the week the answers describe (yyyy-mm-dd), Israeli work week. */
  week_start: string;
  answers: Record<string, string | number | null>;
  submitted_at: string;
  created_at: string;
};

// --- Phase 20a: Instagram insights ---

/**
 * One day of account-level Instagram metrics.
 *
 * Every metric is nullable because Meta answers with an `unavailable[]` list
 * rather than an error when it will not serve a metric (too few followers,
 * value too small to be anonymous, data not yet aggregated). Null means
 * "Meta did not give us this", NOT zero — rendering it as 0 would invent a
 * bad day that never happened.
 */
export type IgDailyMetrics = {
  id: string;
  /** The Instagram user id the numbers belong to. */
  ig_account_id: string;
  /** yyyy-mm-dd. */
  date: string;
  reach: number | null;
  views: number | null;
  total_interactions: number | null;
  profile_views: number | null;
  followers_count: number | null;
  created_at: string;
};

export type IgMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | (string & {});

export type IgMedia = {
  id: string;
  ig_account_id: string;
  /** Instagram's own media id — the one /{media-id}/insights takes. */
  media_id: string;
  media_type: IgMediaType | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments_count: number | null;
  saved: number | null;
  shares: number | null;
  /** When the insights half of this row was last refreshed. */
  metrics_synced_at: string | null;
  created_at: string;
};

// --- Phase 20b: Drive-backed video review ---

export type ClientVideo = {
  id: string;
  client_id: string;
  /** Google Drive file id. The bytes stay in Drive; we only reference them. */
  drive_file_id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  /** Null until Drive has finished processing the file and reports it. */
  duration_seconds: number | null;
  thumbnail_url: string | null;
  synced_at: string;
  created_at: string;
};

/** A single freehand stroke, in coordinates normalised to 0..1. */
export type VideoDrawingStroke = {
  color: string;
  width: number;
  /** [[x, y], ...] with both axes in 0..1 of the video's display box. */
  points: [number, number][];
};

export type VideoDrawing = {
  strokes: VideoDrawingStroke[];
};

/** Who left the note — decides which side of the review it renders on. */
export type VideoCommentAuthorKind = "client" | "agency";

export type VideoComment = {
  id: string;
  video_id: string;
  client_id: string;
  /** Fractional seconds into the video. Never rounded — see the migration. */
  timestamp_seconds: number;
  body: string;
  drawing: VideoDrawing | null;
  author_kind: VideoCommentAuthorKind;
  author_name: string | null;
  resolved_at: string | null;
  created_at: string;
};
