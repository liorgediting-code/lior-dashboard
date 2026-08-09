-- Phase 18 (roadmap 2c): weekly campaign questionnaire.
--
-- One GLOBAL template (client_id is null) is the default every client sees.
-- A client can be given an override template (client_id set), which wins.
-- Enforced with two partial unique indexes rather than a plain unique
-- constraint, because `unique (client_id)` would allow only ONE global row
-- but also treat every null as distinct — the opposite of what's needed.
--
-- `questions` shape (mirrors QuestionnaireQuestion in packages/shared):
--   [{ "id": "slug", "label": "...", "type": "text|textarea|number|rating",
--      "required": true }]
-- `answers` shape: { "<question id>": "value" }

create table questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index questionnaire_templates_global_idx
  on questionnaire_templates ((true)) where client_id is null;
create unique index questionnaire_templates_client_idx
  on questionnaire_templates (client_id) where client_id is not null;

create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  template_id uuid references questionnaire_templates(id) on delete set null,
  -- SUNDAY of the week the answers describe (Israeli Sun–Thu work week).
  -- One response per client per week; re-submitting updates the existing row.
  -- Computed by weekStartIso() in apps/web/lib/crm/questionnaire-week.ts —
  -- every writer must agree on this or one week could get two rows.
  week_start date not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index questionnaire_responses_client_week_idx
  on questionnaire_responses (client_id, week_start);
create index questionnaire_responses_week_idx
  on questionnaire_responses (week_start desc);

-- Seed the default global template. `on conflict do nothing` keeps this
-- migration safe to re-run and safe against a hand-created global row.
insert into questionnaire_templates (client_id, name, questions)
values (
  null,
  'שאלון שבועי',
  '[
    {"id": "leads_quality", "label": "איך הייתה איכות הלידים השבוע?", "type": "rating", "required": true},
    {"id": "deals_closed", "label": "כמה עסקאות נסגרו השבוע?", "type": "number", "required": true},
    {"id": "revenue", "label": "מה ההכנסה מהעסקאות השבוע (₪)?", "type": "number", "required": false},
    {"id": "what_worked", "label": "מה עבד טוב השבוע?", "type": "textarea", "required": false},
    {"id": "problems", "label": "אילו בעיות או חסמים היו?", "type": "textarea", "required": false},
    {"id": "notes", "label": "משהו נוסף שחשוב שנדע?", "type": "textarea", "required": false}
  ]'::jsonb
)
on conflict do nothing;

alter table questionnaire_templates disable row level security;
alter table questionnaire_responses disable row level security;
