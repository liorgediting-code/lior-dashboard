-- Phase 25: renamable labels for the agency CRM's fixed status pipeline.
--
-- agency_leads.status stays a fixed 6-value enum (new/contacted/meeting/
-- proposal/won/lost) — the pipeline itself isn't customizable, unlike the
-- per-client `lead_statuses` table. This table only lets the agency owner
-- rename the label shown for each fixed status, without touching the
-- underlying key or the closed/open semantics tied to it.

create table agency_lead_status_labels (
  status text primary key
    check (status in ('new', 'contacted', 'meeting', 'proposal', 'won', 'lost')),
  label text not null,
  updated_at timestamptz not null default now()
);

insert into agency_lead_status_labels (status, label) values
  ('new', 'חדש'),
  ('contacted', 'יצרנו קשר'),
  ('meeting', 'פגישה'),
  ('proposal', 'הצעת מחיר'),
  ('won', 'נסגר ✅'),
  ('lost', 'לא רלוונטי');

alter table agency_lead_status_labels disable row level security;
