-- Phase 3: automatic per-client CRM (leads), weekly reports, and the
-- "current metrics" function that feeds the before/now comparison and the
-- monthly CPL threshold recalculation.

create table leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text,
  phone text,
  source_ad_id uuid references ads(id),
  stage text not null default 'new' check (stage in ('new', 'contacted', 'qualified', 'won', 'lost')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  deal_value numeric
);

create index leads_client_stage_idx on leads (client_id, stage);

create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,
  lead_quality_score numeric,
  leads_matched_audience int,
  leads_closed_count int,
  report_html text,
  sent_at timestamptz,
  unique (client_id, week_start)
);

create index weekly_reports_client_idx on weekly_reports (client_id, week_start);

-- "Before vs now": current metrics are a rolling aggregate over a date
-- range, so they can't be a stored generated column (fixed baseline row)
-- or a plain view (no parameters). A stable SQL function gives us both.
create function fn_client_current_metrics(
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
      count(*) filter (where stage = 'won') as closes,
      count(*) as total
    from leads
    where client_id = p_client_id
      and created_at between p_since and p_until
  ),
  -- close_rate_fraction is 0-1 (for division); close_rate_pct below is the
  -- same value * 100 for display, matching the 0-100 scale used everywhere
  -- else in the schema (clients.close_rate_pct, baseline_snapshots.close_rate_pct).
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

alter table leads disable row level security;
alter table weekly_reports disable row level security;
