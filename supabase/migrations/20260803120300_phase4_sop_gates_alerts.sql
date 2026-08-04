-- Phase 4: SOP gates, an append-only audit trail (dispute protection),
-- magic-link client approval, alerts log, and the bottleneck view that
-- backs the dashboard widget and the get_sop_bottlenecks MCP tool.

create table sop_gates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  gate_number smallint not null check (gate_number between 1 and 4),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_at timestamptz,
  approved_by text,
  unique (client_id, gate_number)
);

create table sop_gate_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  event_type text not null,
  from_stage smallint,
  to_stage smallint,
  gate_number smallint,
  actor text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index sop_gate_events_client_idx on sop_gate_events (client_id, created_at);

create table magic_links (
  token text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  gate_number smallint not null check (gate_number between 1 and 4),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table alerts_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  alert_type text not null check (
    alert_type in ('questionnaire_overdue', 'gate_stuck', 'cpl_breach')
  ),
  message text not null,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index alerts_log_client_idx on alerts_log (client_id, resolved_at);

-- Stages 3/4/6/8 are the ones that sit behind a gate per the SOP table.
create view sop_bottlenecks as
select
  c.id as client_id,
  c.name,
  c.sop_stage,
  c.sop_stage_updated_at,
  extract(day from now() - c.sop_stage_updated_at)::int as days_stuck,
  sg.gate_number,
  sg.status as gate_status
from clients c
left join sop_gates sg on sg.client_id = c.id and sg.status = 'pending'
where c.sop_stage in (3, 4, 6, 8);

alter table sop_gates disable row level security;
alter table sop_gate_events disable row level security;
alter table magic_links disable row level security;
alter table alerts_log disable row level security;
