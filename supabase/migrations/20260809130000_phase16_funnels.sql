-- Phase 16: funnels page (roadmap #5) — for the agency's own business.
--
-- A funnel is the marketing structure behind an offer: which campaign(s)
-- feed it, what the materials are, and notes about what's working. It can
-- optionally be attached to a client (a funnel built FOR a client) or left
-- unattached (LiorEdits' own funnels).
--
-- `drive_links` reuses the exact jsonb shape already used by
-- clients.drive_links ([{label, url}]) so the existing DriveLinksEditor
-- component works unchanged.

create table funnels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage text check (stage in ('TOFU', 'MOFU', 'BOFU')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  client_id uuid references clients(id) on delete set null,
  description text,
  drive_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index funnels_client_idx on funnels (client_id);
create index funnels_status_idx on funnels (status, created_at desc);

-- Many-to-many: one funnel can be fed by several campaigns, and a campaign
-- can serve more than one funnel. A join table keeps `campaigns` (which is
-- overwritten by the Meta sync in lib/meta/sync.ts) free of app-owned
-- columns that a sync could clobber.
create table funnel_campaigns (
  funnel_id uuid not null references funnels(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (funnel_id, campaign_id)
);

create index funnel_campaigns_campaign_idx on funnel_campaigns (campaign_id);

alter table funnels disable row level security;
alter table funnel_campaigns disable row level security;
