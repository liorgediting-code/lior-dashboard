-- Phase 22: agency-authored forms sent to clients by personal link.
--
-- The agency builds any number of named forms (`form_templates`) and sends one
-- to a client, which mints a `form_submissions` row carrying the token the
-- client fills in at /form/<token>.
--
-- The built-in "טופס אפיון" is seeded here with slug 'intake'. That slug is
-- load-bearing: it marks the form whose first submission advances a client
-- from SOP stage 0 ("תשלום אושר", autoAction "שליחת שאלון") to stage 1
-- ("שאלון מולא"). Any other form is just a form and moves nobody.
--
-- Deliberately NOT questionnaire_templates/_responses: those are the WEEKLY
-- questionnaire, keyed (client_id, week_start) with a global-plus-override
-- model. These forms are one-off, many-per-agency, pick-one-to-send.

create table form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Non-null only for built-in forms the app reasons about by name.
  -- Unique, and null for every agency-created form (Postgres treats nulls as
  -- distinct, so any number of them coexist).
  slug text unique,
  -- [{ "id": "slug", "label": "...", "type": "text|textarea|number|rating",
  --    "required": true }] — mirrors QuestionnaireQuestion in packages/shared,
  -- so the same editor and renderer serve both.
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- restrict, not cascade: answers must never vanish because a template was
  -- tidied up. lib/actions/forms.ts refuses to delete a template that has
  -- submissions, so this constraint is a backstop, not the user-facing rule.
  template_id uuid not null references form_templates(id) on delete restrict,
  -- The token IS the authorization for /form/<token>: a client at stage 0 has
  -- no portal login yet. No expiry — an onboarding form that locks the client
  -- out just becomes a support ticket.
  token text not null unique,
  answers jsonb not null default '{}'::jsonb,
  -- Null = link issued, not filled in yet. This is the whole state machine.
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  -- One live link per (client, form): re-sending hands back the SAME url
  -- rather than minting a second token that would race the one already
  -- sitting in the client's WhatsApp.
  unique (client_id, template_id)
);

create index form_submissions_client_idx on form_submissions (client_id);
create index form_submissions_pending_idx
  on form_submissions (created_at) where submitted_at is null;

-- The built-in intake form. `on conflict do nothing` keeps this re-runnable.
insert into form_templates (name, slug, questions)
values (
  'טופס אפיון',
  'intake',
  '[
    {"id": "name", "label": "שם", "type": "text", "required": true},
    {"id": "business_summary", "label": "מה העסק עושה בכמה מילים? (אני עוזר ל-X לעשות Y, לדוגמה)", "type": "textarea", "required": true},
    {"id": "main_product", "label": "מה המוצר המרכזי של העסק שלך?", "type": "textarea", "required": true},
    {"id": "pricing", "label": "מה התמחור שלו?", "type": "text", "required": true},
    {"id": "service_area", "label": "האם אתה עובד באיזור מסוים כרגע או בכל הארץ? אם באיזור מסוים ציין אותו (למשל, רק המרכז)", "type": "text", "required": true},
    {"id": "tried_marketing", "label": "אילו דברים כבר ניסית בשיווק שלא הביאו תוצאות?", "type": "textarea", "required": false},
    {"id": "target_audience", "label": "כרגע, מי קהל היעד שלך? (למי אתה פונה)", "type": "textarea", "required": true},
    {"id": "ideal_client", "label": "תתאר לי את הלקוח האידיאלי שלך (לא חייב להיות מומצא, יכול לחשוב על לקוח שכבר עבדת איתו ואהבת מאוד)", "type": "textarea", "required": true},
    {"id": "core_problem", "label": "מה הבעיה המרכזית של קהל היעד שלך / הלקוח האידיאלי שקניית המוצר / שירות שלך פותרת?", "type": "textarea", "required": true},
    {"id": "biggest_dream", "label": "מה החלום הכי גדול שלו? (שאתה עוזר לו להשיג)", "type": "textarea", "required": true},
    {"id": "monthly_budget", "label": "מה תקציב השיווק שלך החודשי? (אם קשה לך להחליט, לרוב שמים 30% מההכנסה שלך)", "type": "number", "required": true},
    {"id": "competitors", "label": "תן לי 2-3 שמות של עסקים דומים שאתה רואה כמתחרים שלך (גם אם לא ישירות), או שאתה רואה כהשראה", "type": "textarea", "required": false},
    {"id": "objections", "label": "מה הסיבות הכי נפוצות שלקוחות פוטנציאליים אומרים ''לא'' או מתלבטים? (כלומר, מה ההתנגדויות הכי גדולות והנפוצות)", "type": "textarea", "required": true},
    {"id": "purchase_frequency", "label": "בממוצע, לקוח קונה ממך פעם אחת או חוזר? אם חוזר, כמה פעמים בשנה בערך?", "type": "text", "required": true},
    {"id": "customer_value", "label": "באופן כללי, כמה שווה לקוח שלך? (למשל אם לקוח קונה מוצר ב-3000, בממוצע 3 פעמים, הוא שווה 9000 שקל — זה יעזור לנו להבין כמה שווה לנו לשלם על השגת לקוח)", "type": "number", "required": true},
    {"id": "current_cac", "label": "כמה עולה לך (בממוצע) להשיג לקוח חדש היום?", "type": "number", "required": false}
  ]'::jsonb
)
on conflict do nothing;

alter table form_templates disable row level security;
alter table form_submissions disable row level security;
