-- Phase 8: single-row app-wide settings. Currently just the Meta System
-- User token used to sync every client's ad account from one Meta
-- Business Manager, replacing the never-activated per-client OAuth flow.

create table app_settings (
  id smallint primary key default 1 check (id = 1),
  meta_system_user_token text,
  meta_business_id text,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1);

alter table app_settings disable row level security;
