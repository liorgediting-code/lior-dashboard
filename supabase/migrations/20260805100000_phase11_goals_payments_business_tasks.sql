-- Phase 11: goals page (target vs. actual dashboard metrics), client
-- payment tracking (agency revenue), and one-off business tasks (missions
-- with no client — the app-level "משימות לעסק" tab).

alter table missions alter column client_id drop not null;

create table client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric not null,
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index client_payments_client_idx on client_payments (client_id, paid_on);

-- One row per metric — "the goal I've set for X" — editable via upsert,
-- not a history table. Actuals are computed live from existing data.
create table goals (
  id uuid primary key default gen_random_uuid(),
  metric text not null unique check (metric in ('client_count', 'revenue', 'leads_count')),
  target_value numeric not null,
  created_at timestamptz not null default now()
);

alter table client_payments disable row level security;
alter table goals disable row level security;
