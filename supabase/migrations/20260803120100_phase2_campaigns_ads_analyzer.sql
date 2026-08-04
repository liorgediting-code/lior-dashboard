-- Phase 2: Meta campaign hierarchy, daily ad metrics, and everything the
-- deterministic ad analyzer + kill queue need.

-- Per-client Meta connection. meta_access_token is plain text here for
-- local/demo simplicity — before going live with real tokens, move it to
-- Supabase Vault or an equivalent secret store.
alter table clients add column meta_ad_account_id text;
alter table clients add column meta_access_token text;

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  meta_id text,
  name text not null,
  funnel_stage text check (funnel_stage in ('TOFU', 'MOFU', 'BOFU')),
  status text
);

create table adsets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  meta_id text,
  name text not null,
  funnel_stage text check (funnel_stage in ('TOFU', 'MOFU', 'BOFU')),
  status text
);

create table ads (
  id uuid primary key default gen_random_uuid(),
  adset_id uuid not null references adsets(id) on delete cascade,
  meta_id text,
  name text not null,
  funnel_stage text check (funnel_stage in ('TOFU', 'MOFU', 'BOFU')),
  status text
);

create index campaigns_client_idx on campaigns (client_id);
create index adsets_campaign_idx on adsets (campaign_id);
create index ads_adset_idx on ads (adset_id);

create table ad_metrics_daily (
  ad_id uuid not null references ads(id) on delete cascade,
  date date not null,
  spend numeric not null default 0,
  leads int not null default 0,
  impressions int not null default 0,
  clicks int not null default 0,
  cpl numeric generated always as (case when leads > 0 then spend / leads else null end) stored,
  primary key (ad_id, date)
);

-- Spec idea 2: default close-rate lookup table that improves once enough
-- clients in the same business_type have real closes. close_rate_estimate
-- is on the same 0-100 scale as clients.close_rate_pct (20 means 20%).
create table business_type_benchmarks (
  business_type text primary key,
  close_rate_estimate numeric not null,
  sample_size int not null default 0,
  source text not null default 'seed_default' check (source in ('seed_default', 'learned')),
  updated_at timestamptz not null default now()
);

insert into business_type_benchmarks (business_type, close_rate_estimate, sample_size, source) values
  ('local_service', 20, 0, 'seed_default'),
  ('ecommerce', 3, 0, 'seed_default'),
  ('coaching_consulting', 15, 0, 'seed_default'),
  ('real_estate', 5, 0, 'seed_default'),
  ('clinic_medical', 25, 0, 'seed_default'),
  ('other', 10, 0, 'seed_default');

create table cpl_threshold_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  max_cpl numeric not null,
  computed_from text not null check (computed_from in ('default_table', 'actual_closes')),
  computed_at timestamptz not null default now()
);

create table kill_queue_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  entity_type text not null check (entity_type in ('ad', 'adset')),
  entity_id uuid not null,
  computed_status text not null check (computed_status in ('KILL', 'SUSPECT')),
  reason text,
  computed_cpl numeric,
  max_cpl_at_detection numeric,
  detected_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  approved_by text,
  approved_at timestamptz,
  -- always false: killing the ad in Meta Ads Manager is a deliberate human
  -- action, this system never calls Meta's API to pause/delete anything.
  meta_action_taken boolean not null default false
);

-- one pending kill-queue row per entity at a time
create unique index kill_queue_pending_entity_idx on kill_queue_items (entity_type, entity_id)
  where status = 'pending';

create index kill_queue_client_idx on kill_queue_items (client_id, status);

alter table campaigns disable row level security;
alter table adsets disable row level security;
alter table ads disable row level security;
alter table ad_metrics_daily disable row level security;
alter table business_type_benchmarks disable row level security;
alter table cpl_threshold_history disable row level security;
alter table kill_queue_items disable row level security;
