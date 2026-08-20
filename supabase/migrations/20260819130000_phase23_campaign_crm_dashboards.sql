-- Phase 23: cross-client campaigns list + per-CRM campaign dashboards.
--
-- Two booleans rather than a join table (the `funnel_campaigns` idiom from
-- phase 16) on purpose: this is not membership in a collection, it is a
-- VISIBILITY flag with exactly two fixed destinations — the agency's own
-- CRM and the client's CRM/portal. A join table would need a synthetic
-- "surface" enum row per campaign to say the same thing, and every read
-- would become a join for a value that is one bit.
--
-- Note the asymmetry: `show_in_client_crm` exposes spend/CPL inside the
-- client PORTAL. That is already consistent with what clients see —
-- lib/reports/build-report.ts puts total and per-campaign spend, leads and
-- CPL in every published weekly report — so this leaks nothing new.

alter table campaigns add column show_in_agency_crm boolean not null default false;
alter table campaigns add column show_in_client_crm boolean not null default false;

-- Partial indexes: both flags are false for almost every row, and the only
-- queries are "which campaigns are pinned", never "which are not".
create index campaigns_agency_crm_idx on campaigns (name) where show_in_agency_crm;
create index campaigns_client_crm_idx on campaigns (client_id, name) where show_in_client_crm;
