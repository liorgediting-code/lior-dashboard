-- Phase 17: notes feed (roadmap #6) — dated notes, optionally attached to a
-- client and/or a funnel, rendered as a reverse-chronological feed with a
-- left-side filter panel.
--
-- Runs after phase 16 because of the funnels FK — migration filenames are
-- timestamp-ordered, so 1400 > 1300 guarantees `funnels` already exists.

create table notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  -- The date the note is ABOUT (user-editable, backdatable), distinct from
  -- created_at which is when the row was written.
  note_date date not null default current_date,
  client_id uuid references clients(id) on delete cascade,
  funnel_id uuid references funnels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_date_idx on notes (note_date desc, created_at desc);
create index notes_client_idx on notes (client_id) where client_id is not null;
create index notes_funnel_idx on notes (funnel_id) where funnel_id is not null;

alter table notes disable row level security;
