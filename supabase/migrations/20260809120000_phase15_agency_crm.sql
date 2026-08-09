-- Phase 15: the agency's OWN CRM (roadmap #4).
--
-- Deliberately separate from `leads` (which is per-CLIENT lead data, with
-- client-customizable statuses/columns). These are LiorEdits' own
-- prospects, so the pipeline is a fixed, agency-wide status set — no
-- per-tenant customization, no client_id, no portal exposure.

create table agency_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  phone text,
  email text,
  source text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'meeting', 'proposal', 'won', 'lost')),
  deal_value numeric,
  notes text,
  follow_up_at date,
  -- Set when the lead reaches won/lost, so "deals closed this month" can be
  -- computed live without a history table (same pattern as leads.closed_at).
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agency_leads_status_idx on agency_leads (status, created_at desc);
create index agency_leads_follow_up_idx on agency_leads (follow_up_at) where follow_up_at is not null;

alter table agency_leads disable row level security;
