-- Phase 10: recurring daily business tasks ("משימות לעסק"). A task
-- template is defined once; each day it needs to be checked off again.
-- Completions are dated rows, not a boolean flag, so history/streaks and
-- the dashboard's daily completion % survive across days without any
-- reset job.

create table daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  daily_task_id uuid not null references daily_tasks(id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  unique (daily_task_id, completed_on)
);

create index daily_task_completions_task_idx on daily_task_completions (daily_task_id, completed_on);

alter table daily_tasks disable row level security;
alter table daily_task_completions disable row level security;
