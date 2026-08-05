// Minimal hand-written Supabase Database type so supabase-js gets real
// table/column typing instead of falling back to `never`. Row shapes are
// the domain types (single source of truth, kept in sync with
// supabase/migrations/*.sql — see domain.ts). Insert/Update are
// deliberately permissive (Partial<Row>) rather than precisely mirroring
// which columns have DB defaults, to avoid duplicating every table's shape
// a third time; tighten here once `supabase gen types typescript --local`
// is available (see apps/mcp-server/README.md for local Supabase setup).
import type {
  Client,
  BaselineSnapshot,
  Mission,
  Campaign,
  AdSet,
  Ad,
  AdMetricDaily,
  BusinessTypeBenchmark,
  CplThresholdHistoryRow,
  KillQueueItem,
  Lead,
  LeadStatus,
  LeadColumn,
  WeeklyReport,
  SopGate,
  SopGateEvent,
  MagicLink,
  AlertLogRow,
  WhatsappAutomation,
  WhatsappAutomationRun,
  AiInsight,
  SopBottleneck,
  ClientCurrentMetrics,
  AppSettings,
  DailyTask,
  DailyTaskCompletion,
} from "./domain";

// supabase-js's GenericTable/GenericView require a `Relationships` array
// (foreign-key metadata used for embedded-resource typing, e.g.
// `.select("*, clients(name)")`) even though we're not generating this from
// a real schema introspection — tables that are never embedded elsewhere
// default to `[]`; the handful that ARE embedded declare their FK below so
// postgrest-js can type the joined shape instead of erroring out.
type Table<Row, Relationships extends readonly Record<string, unknown>[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

type ClientFk<TableName extends string> = [
  {
    foreignKeyName: `${TableName}_client_id_fkey`;
    columns: ["client_id"];
    isOneToOne: false;
    referencedRelation: "clients";
    referencedColumns: ["id"];
  },
];

export type Database = {
  public: {
    Tables: {
      clients: Table<Client>;
      baseline_snapshots: Table<BaselineSnapshot>;
      missions: Table<Mission, ClientFk<"missions">>;
      campaigns: Table<Campaign>;
      adsets: Table<AdSet>;
      ads: Table<Ad>;
      ad_metrics_daily: Table<AdMetricDaily>;
      business_type_benchmarks: Table<BusinessTypeBenchmark>;
      cpl_threshold_history: Table<CplThresholdHistoryRow>;
      kill_queue_items: Table<KillQueueItem, ClientFk<"kill_queue_items">>;
      leads: Table<Lead>;
      lead_statuses: Table<LeadStatus, ClientFk<"lead_statuses">>;
      lead_columns: Table<LeadColumn, ClientFk<"lead_columns">>;
      weekly_reports: Table<WeeklyReport>;
      sop_gates: Table<SopGate>;
      sop_gate_events: Table<SopGateEvent>;
      magic_links: Table<MagicLink, ClientFk<"magic_links">>;
      alerts_log: Table<AlertLogRow>;
      whatsapp_automations: Table<WhatsappAutomation>;
      whatsapp_automation_runs: Table<
        WhatsappAutomationRun,
        [
          {
            foreignKeyName: "whatsapp_automation_runs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_automation_runs_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ]
      >;
      ai_insights: Table<AiInsight>;
      app_settings: Table<AppSettings>;
      daily_tasks: Table<DailyTask>;
      daily_task_completions: Table<
        DailyTaskCompletion,
        [
          {
            foreignKeyName: "daily_task_completions_daily_task_id_fkey";
            columns: ["daily_task_id"];
            isOneToOne: false;
            referencedRelation: "daily_tasks";
            referencedColumns: ["id"];
          },
        ]
      >;
    };
    Views: {
      sop_bottlenecks: { Row: SopBottleneck; Relationships: [] };
    };
    Functions: {
      fn_client_current_metrics: {
        Args: { p_client_id: string; p_since?: string; p_until?: string };
        Returns: ClientCurrentMetrics[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
