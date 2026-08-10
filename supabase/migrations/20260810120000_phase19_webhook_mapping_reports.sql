-- Phase 19: configurable webhook field mapping + weekly/monthly client reports.

-- === Webhook field mapping ===============================================
--
-- The lead webhooks previously hard-coded which incoming keys become
-- leads.name/phone/email, and dumped everything else into
-- leads.custom_fields under its RAW key. But the CRM table renders
-- custom_fields keyed by lead_columns.id — so an extra Meta lead-form
-- question ("what's your budget?") arrived in the database and was invisible
-- in the UI. This table is the missing translation layer: it maps an
-- incoming key to where it should land.
--
-- `target` is intentionally NOT a foreign key: it holds either one of the
-- built-in field names ('name' | 'phone' | 'email' | 'ignore') or a
-- lead_columns.id. A FK can't express that union, so the app validates it
-- (see lib/crm/webhook-mapping.ts) and treats a target that no longer
-- resolves as an unmapped key rather than an error.
create table webhook_field_mappings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source_key text not null,
  target text not null,
  created_at timestamptz not null default now()
);

-- Keys are matched case-insensitively (the webhooks already lowercased the
-- built-in names), so uniqueness has to be too — otherwise "Budget" and
-- "budget" could be mapped to two different columns and the winner would
-- depend on row order.
create unique index webhook_field_mappings_client_key_idx
  on webhook_field_mappings (client_id, lower(source_key));

alter table webhook_field_mappings disable row level security;

-- === Monthly reports =====================================================
--
-- weekly_reports already stores one row per (client, week_start). A monthly
-- report is the same thing over a longer range, so it gets `period_kind`
-- rather than a parallel table. `week_start` keeps its name (and its
-- meaning: the first day of the period) so no existing reader breaks.
alter table weekly_reports add column period_kind text not null default 'week'
  check (period_kind in ('week', 'month'));
alter table weekly_reports add column period_end date;

-- The old unique key was (client_id, week_start), which would let a monthly
-- report collide with a weekly one whenever a month starts on a Sunday.
-- Dropped by name with a guard so this migration is safe to re-run and safe
-- against a hand-renamed constraint.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'weekly_reports_client_id_week_start_key'
  ) then
    alter table weekly_reports drop constraint weekly_reports_client_id_week_start_key;
  end if;
end $$;

create unique index if not exists weekly_reports_client_period_idx
  on weekly_reports (client_id, week_start, period_kind);
