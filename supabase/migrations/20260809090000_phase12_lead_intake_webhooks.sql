-- Phase 12: lead intake webhooks — Meta Lead Ads ad->client resolution
-- (needs a way to dedupe retried deliveries) and a generic per-client
-- webhook URL for external automation tools (Make/Zapier/n8n).

alter table leads add column meta_leadgen_id text;
create unique index leads_meta_leadgen_id_idx on leads (meta_leadgen_id) where meta_leadgen_id is not null;

alter table clients add column webhook_secret text;
