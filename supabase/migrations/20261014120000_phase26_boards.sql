-- Phase 26: Drawboard — whiteboard files. Each board is a list of drawing
-- elements (jsonb), optionally assigned to a client so it shows up in that
-- client's "Boards" tab where it can be edited and presented.

create table boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references clients(id) on delete set null,
  elements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index boards_client_idx on boards (client_id) where client_id is not null;
create index boards_updated_idx on boards (updated_at desc);

alter table boards disable row level security;
