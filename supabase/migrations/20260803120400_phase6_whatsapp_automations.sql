-- Phase 6: Green API WhatsApp automation builder.

create table whatsapp_automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  trigger text not null,
  steps jsonb not null default '[]',
  green_api_instance_id text
);

create index whatsapp_automations_client_idx on whatsapp_automations (client_id);

-- A route handler can't literally sleep for the "wait" step, so each
-- automation run tracks its own state and gets advanced by a cron tick.
create table whatsapp_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references whatsapp_automations(id) on delete cascade,
  lead_id uuid references leads(id),
  current_step_index int not null default 0,
  next_action_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index whatsapp_runs_due_idx on whatsapp_automation_runs (next_action_at)
  where status = 'active';

alter table whatsapp_automations disable row level security;
alter table whatsapp_automation_runs disable row level security;
