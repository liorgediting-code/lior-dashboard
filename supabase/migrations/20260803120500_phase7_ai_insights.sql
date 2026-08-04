-- Phase 7: optional AI Insights panel. Stores only the phrasing generated
-- from the deterministic analyzer's *output* — never raw ad account data.

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date,
  prompt_input_summary jsonb,
  generated_text text,
  model text,
  created_at timestamptz not null default now()
);

create index ai_insights_client_idx on ai_insights (client_id, week_start);

alter table ai_insights disable row level security;
