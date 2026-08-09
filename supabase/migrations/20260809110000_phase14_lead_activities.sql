-- Phase 14: per-lead activity log (calls / WhatsApp messages / notes),
-- timestamped, shown on both the internal and portal CRM views.
create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('call', 'whatsapp', 'note')),
  note text not null,
  created_at timestamptz not null default now()
);

create index lead_activities_lead_idx on lead_activities (lead_id, created_at desc);
alter table lead_activities disable row level security;
