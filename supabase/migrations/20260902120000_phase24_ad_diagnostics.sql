-- Phase 24: the ad diagnostic engine.
--
-- The engine walks the funnel top-down (hook → hold → CTR → CPC → landing
-- page → CPA) and stops describing a campaign as "fine" the moment an early
-- gate fails. That needs three things the schema did not have:
--
-- 1. The funnel's own numerators. ad_metrics_daily stored spend/leads/
--    impressions/clicks — enough for CPL and a crude CTR, nothing else.
--    Hook rate needs 3-second views, hold rate needs 50%-watched, a real
--    CTR needs LINK clicks (not `clicks`, which counts every click on the
--    ad including likes and profile taps), and landing-page conversion
--    needs a conversion count that is not "leads" for e-commerce clients.
--
-- 2. A per-campaign target CPA. The last rule in the funnel is economic,
--    not operational: "everything upstream is healthy, the ad is doing its
--    job, the acquisition just costs more than this business can pay". That
--    number exists only in the operator's head, so it gets a column.
--
-- 3. Editable thresholds. A B2B lead-gen campaign and an e-commerce
--    campaign fail at completely different CTRs; a fixed 1% would flag one
--    of them permanently. Defaults live in code (lib/diagnostics/rules.ts);
--    this table only stores deviations from them.

-- --- 1. funnel numerators -----------------------------------------------

-- NOTE ON reach: reach is NOT additive. Summing 30 daily reach values
-- double-counts everyone who saw the ad on more than one day, so a summed
-- reach is an UPPER bound and the frequency derived from it
-- (impressions / summed_reach) is a LOWER bound. That direction is the safe
-- one for the fatigue rule — it under-reports frequency, so it can miss
-- fatigue but never invent it. See lib/diagnostics/engine.ts.
alter table ad_metrics_daily add column reach integer not null default 0;

-- `clicks` (already present) is all_clicks: likes, comments, profile taps
-- and link clicks together. Every CTR/CPC rule in the engine wants the link
-- clicks alone, so they get their own column instead of quietly reusing a
-- number that runs 2-4x higher.
alter table ad_metrics_daily add column link_clicks integer not null default 0;

alter table ad_metrics_daily add column three_sec_video_views integer not null default 0;
alter table ad_metrics_daily add column video_50_watched integer not null default 0;
alter table ad_metrics_daily add column video_75_watched integer not null default 0;
alter table ad_metrics_daily add column video_completed integer not null default 0;

-- Purchases and revenue sit alongside `leads` rather than replacing it: one
-- agency runs both lead-gen and e-commerce clients, and the engine picks
-- whichever conversion column the campaign's goal names.
alter table ad_metrics_daily add column purchases integer not null default 0;
alter table ad_metrics_daily add column add_to_cart integer not null default 0;
alter table ad_metrics_daily add column revenue numeric(12, 2) not null default 0;

-- --- 2. per-campaign economics ------------------------------------------

alter table campaigns add column target_cpa numeric(12, 2);
-- Which conversion the funnel's bottom gate counts: 'leads' or 'purchases'.
alter table campaigns add column conversion_goal text not null default 'leads'
  check (conversion_goal in ('leads', 'purchases'));

-- --- 3. editable thresholds ---------------------------------------------

-- One row per client, plus exactly one global row (client_id is null). A
-- null column means "inherit" — the client row from the global row, the
-- global row from the code defaults — so an operator who only wants to
-- loosen CTR for one client does not have to restate the other nine
-- numbers and silently freeze them against future default changes.
create table diagnostic_thresholds (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  hook_rate numeric(6, 4),
  hold_rate numeric(6, 4),
  ctr_link_click numeric(6, 4),
  cpc_account_multiple numeric(6, 2),
  landing_page_conversion_rate numeric(6, 4),
  frequency numeric(6, 2),
  cpm_account_multiple numeric(6, 2),
  min_impressions integer,
  min_spend numeric(12, 2),
  min_days_active integer,
  updated_at timestamptz not null default now()
);

-- Enforces "at most one global row" and "at most one row per client" in the
-- same breath: a plain unique(client_id) would let unlimited global rows
-- through, because in Postgres every null is distinct from every other.
create unique index diagnostic_thresholds_client_idx on diagnostic_thresholds (client_id) where client_id is not null;
create unique index diagnostic_thresholds_global_idx on diagnostic_thresholds ((true)) where client_id is null;

insert into diagnostic_thresholds (client_id) values (null);
