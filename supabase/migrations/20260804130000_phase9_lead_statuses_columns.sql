-- Phase 9: per-client customizable lead statuses & columns, replacing the
-- fixed 5-stage kanban. Every client keeps exactly one 'won' and one
-- 'lost' status (app-enforced undeletable, renameable) so revenue/close-
-- rate math survives clients defining their own additional 'open' statuses.

create table lead_statuses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('open', 'won', 'lost')),
  sort_order int not null default 0,
  is_default boolean not null default false
);

create index lead_statuses_client_idx on lead_statuses (client_id, sort_order);

create table lead_columns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'number')),
  sort_order int not null default 0
);

create index lead_columns_client_idx on lead_columns (client_id, sort_order);

alter table leads
  add column email text,
  add column status_id uuid references lead_statuses(id),
  add column custom_fields jsonb not null default '{}',
  drop column stage;

alter table leads alter column status_id set not null;

create index leads_client_status_idx on leads (client_id, status_id);

-- close_rate/closes now resolve through lead_statuses.kind instead of a
-- literal stage string, so custom status labels don't break this function.
create or replace function fn_client_current_metrics(
  p_client_id uuid,
  p_since date default current_date - 30,
  p_until date default current_date
)
returns table (
  spend numeric,
  leads_count int,
  closes int,
  avg_cost_per_lead numeric,
  close_rate_pct numeric,
  cost_per_deal numeric
)
language sql
stable
as $$
  with m as (
    select sum(amd.spend) as spend, sum(amd.leads) as leads_count
    from ad_metrics_daily amd
    join ads a on a.id = amd.ad_id
    join adsets ase on ase.id = a.adset_id
    join campaigns c on c.id = ase.campaign_id
    where c.client_id = p_client_id
      and amd.date between p_since and p_until
  ),
  l as (
    select
      count(*) filter (where ls.kind = 'won') as closes,
      count(*) as total
    from leads le
    join lead_statuses ls on ls.id = le.status_id
    where le.client_id = p_client_id
      and le.created_at between p_since and p_until
  ),
  r as (
    select (l.closes::numeric / nullif(l.total, 0)) as close_rate_fraction
    from l
  )
  select
    m.spend,
    m.leads_count,
    l.closes,
    m.spend / nullif(m.leads_count, 0) as avg_cost_per_lead,
    r.close_rate_fraction * 100 as close_rate_pct,
    (m.spend / nullif(m.leads_count, 0)) / nullif(r.close_rate_fraction, 0) as cost_per_deal
  from m, l, r;
$$;

alter table lead_statuses disable row level security;
alter table lead_columns disable row level security;
