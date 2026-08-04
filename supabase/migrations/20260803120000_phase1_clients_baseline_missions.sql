-- Phase 1: client profile, pre-engagement baseline snapshot, missions

create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null,
  contact_info jsonb not null default '{}',
  deal_price_avg numeric,
  close_rate_pct numeric,
  monthly_revenue numeric,
  deals_per_month numeric,
  price_range_low numeric,
  price_range_high numeric,
  profit_ratio numeric not null default 5,
  sop_stage smallint not null default 0 check (sop_stage between 0 and 8),
  sop_stage_updated_at timestamptz not null default now(),
  -- Gate 1 required-field enforcement (spec idea 7): call recording/transcript
  -- must be present before Gate 1 can be approved.
  strategy_call_recording_url text,
  strategy_call_transcript_url text,
  drive_links jsonb not null default '[]',
  -- filled in once a per-client CRM auth layer ships (deferred this round)
  crm_password_hash text,
  -- recalculated monthly from real closes, see fn in phase 3 migration
  max_cpl numeric,
  created_at timestamptz not null default now()
);

comment on column clients.drive_links is 'jsonb array of {label, url} rendered as quick-access buttons on the profile';
comment on column clients.max_cpl is 'recalculated by /api/cron/monthly-cpl-recalc from actual lead closes (phase 3)';

-- Feature A: pre-engagement baseline, captured once and never mutated again,
-- used to show "before vs now" improvement on the client profile.
create table baseline_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  leads_per_month numeric,
  avg_cost_per_lead numeric,
  revenue numeric,
  close_rate_pct numeric,
  product_price numeric,
  -- Feature B: cost to acquire one paying customer = CPL / close rate.
  -- close_rate_pct is stored on a 0-100 scale (25 means 25%), hence /100.0
  -- to get the fraction before dividing.
  cost_per_deal numeric generated always as (avg_cost_per_lead / nullif(close_rate_pct / 100.0, 0)) stored,
  captured_at timestamptz not null default now()
);

create table missions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create index missions_due_priority_idx on missions (due_date, priority);
create index missions_client_idx on missions (client_id);

alter table clients disable row level security;
alter table baseline_snapshots disable row level security;
alter table missions disable row level security;
-- TODO: enable RLS + policies once Supabase Auth ships. Until then all
-- server-side code talks to Postgres with the service-role key.
