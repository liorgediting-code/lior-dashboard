# Project Status — dashboard-lior ("LiorEdits")

Last updated: 2026-08-09. Written so a future session (or a fresh context
after `/compact`) can pick up exactly where this one left off without
re-deriving anything below.

## What this app is

Internal dashboard for an ad-management agency ("LiorEdits"), Next.js 14
App Router + Supabase, Hebrew/RTL UI. Originally a big wishlist from the
user; being built in ordered phases (see Roadmap below). Repo root:
`/Users/liorgabay/Documents/projects/dashboard-lior`.

## Live deployment — READ THIS FIRST

**This app runs against a real Supabase project with real client data,
not a throwaway sandbox.**

- Supabase project ref: `ykqmhkzletbaisqsjesv` (org: `liorgediting-code's Project`).
- The env file Next.js actually reads is **`apps/web/.env.local`**, NOT a
  root-level `.env.local` — this is a monorepo and Next.js only loads env
  files from its own app directory. (Wasted real time on this once
  already — don't repeat it.) `.env.example` at the repo root is just the
  template; `README.md` already says `cp .env.example apps/web/.env.local`.
- `apps/web/.env.local` has real Supabase URL/anon/service-role keys and a
  real `SESSION_SECRET` already filled in. It's gitignored — never commit it,
  never paste its contents into a file that gets committed.
- The Supabase CLI needs `SUPABASE_ACCESS_TOKEN` set to a personal access
  token to talk to this project (the default logged-in CLI account on this
  machine does NOT have access to it — a different token was supplied
  mid-session; ask the user for a fresh one if `supabase` commands fail
  with an auth/permission error). Once set: `supabase link --project-ref
  ykqmhkzletbaisqsjesv` then `supabase db push` applies pending migrations
  directly to the remote Postgres — no Docker needed for this (Docker/
  Podman is NOT installed on this Mac, so `supabase start`/`db reset`
  for a local instance will not work).
- **DO NOT use the `supabase` MCP server for this project.** It is
  connected to a DIFFERENT Supabase project (its migration list is
  `profiles`/`courses`/`lessons`/`exercises` — a course platform, not this
  dashboard). That applies to every tool it exposes, including
  `execute_sql`, `apply_migration` and `generate_typescript_types` — using
  any of them here would read or write the wrong database. Use the
  Supabase **CLI** against project ref `ykqmhkzletbaisqsjesv` only.
- **Migrations must be written to survive existing data.** This project
  already has real rows (clients, leads, payments, daily tasks, etc.) —
  never write a migration assuming an empty table. Check row counts first
  (`echo "select count(*) from X;" | supabase db query --linked`) and
  backfill/seed defensively. This bit once already (see git log
  `ed307b1`).
- **Known dev-server trap:** after pulling/editing code, if pages start
  behaving weirdly (wrong data, missing fields, blank renders) with no
  errors in the code, it's very likely a stale `.next` build cache from a
  long-running dev process. Fix: stop the server, `rm -rf apps/web/.next`,
  restart. This cost real time once already — try it FIRST before
  debugging "phantom" bugs.
- **Disk space:** this Mac's system disk filled to 100% mid-session once
  already and blocked file writes. If that happens again, `npm cache clean
  --force` is a safe, large, instantly-regenerable win (freed ~4.2GB last
  time). The user has since cleared more space manually.
- Dev server: `npm run dev` from repo root (or `.claude/launch.json`'s
  `web` config via the preview tool) starts `apps/web` on port 3000.
  Package manager is **npm**, not pnpm/yarn (npm workspaces, root
  `package.json` scripts shell out to `npm run X --workspace=apps/web`).

## Roadmap (as originally scoped with the user)

1. ✅ **Settings + JSON-to-form conversion** — done. Meta System User Token
   settings page (`/settings`), `drive_links`/WhatsApp `steps` converted
   from raw-JSON textareas to row-builder UIs. Spec:
   `docs/superpowers/specs/2026-08-04-settings-and-json-forms-design.md`,
   plan: `docs/superpowers/plans/2026-08-04-settings-and-json-forms.md`.
2. **Client CRM portal** — split into 2a/2b/2c:
   - ✅ **2a — Client portal + Monday-style CRM** — done. Password-protected
     client portal (`/client/[clientId]/*`), per-client customizable lead
     statuses (won/lost protected, everything else client-managed) and
     custom text/number columns, one shared `CrmTable`/`CrmManagePanel`
     rendered on both the internal (`/clients/[id]/crm`, no login) and
     portal pages. Auth: Node `crypto` scrypt + HMAC session cookies, no
     third-party auth library. Spec:
     `docs/superpowers/specs/2026-08-04-client-crm-portal-design.md`, plan:
     `docs/superpowers/plans/2026-08-04-client-crm-portal.md`.
     - **Reworked 2026-08-09** after the user pointed out the portal shared
       the internal admin's layout/nav — a client logging into their portal
       could type `/clients` in the address bar and see every other
       client's data. Fixed by moving ALL internal admin pages (dashboard,
       `/clients`, `/missions`, `/goals`, `/kill-queue`, `/settings`) into a
       Next.js route group `app/(admin)/` with its own `layout.tsx` that
       renders `<Nav/>`; the root `app/layout.tsx` now has no nav at all.
       `/client/[clientId]/*` (the portal) and `/approve/[token]` (magic
       link) sit outside that group, so they never render the admin nav or
       link into it. **Note:** this only hides/removes navigation paths —
       the admin routes still have no login of their own (open-by-design,
       see `assert-crm-access.ts`), so anyone who already knows/guesses an
       admin URL can still load it directly. The user was asked and
       explicitly said skip real admin auth for now (`No, just separate
       the layouts for now`) since this only runs on their own machine
       today — revisit before ever deploying this somewhere reachable by a
       client.
     - Portal also got its own visual identity (indigo top bar "הפורטל
       האישי שלך · LiorEdits", `app/client/[clientId]/layout.tsx`), a
       `CrmDashboardStats` component (total/open/new-this-week/won counts
       + an overdue-follow-ups banner, shown on both the portal and the
       internal `/clients/[id]/crm` view since they share data), and a new
       `leads.follow_up_at` date column editable inline in `CrmTable`
       (overdue rows on still-open leads highlight red). Migration:
       `supabase/migrations/20260809100000_phase13_lead_followups.sql`.
     - Fixed a real bug while in this code: `changeClientPasswordAction`
       (`apps/web/lib/actions/client-auth.ts`) updated the password hash
       but never re-signed the session cookie (which is bound to the hash
       at login time), so a client changing their own password got
       silently logged out. Now re-signs the cookie on success, and
       `ClientPortalHeader` shows a real success/error message instead of
       swallowing the `password_success`/`password_error` redirect params.
     - **Extended 2026-08-09** with a big batch the user asked for in one
       go: lead source attribution (`מקור` column in `CrmTable`, resolved
       from `leads.source_ad_id` → `ads`/`adsets`/`campaigns` via
       `lib/crm/lead-sources.ts` — leads without a source ad show "ידני";
       full auto-attribution from the *generic* automation webhook is
       still a TODO, only the Meta webhook sets `source_ad_id` today);
       a unified "צור/רענן CRM ללקוח" action
       (`components/create-crm-panel.tsx`) that generates the portal
       password AND webhook secret together and shows both plus a
       ready-to-paste Claude Code/Make.com automation prompt — replaces
       the old two-separate-buttons flow; "עסקאות החודש" stat in
       `CrmDashboardStats` (won leads with `closed_at` in the current
       calendar month — recomputes every render so it rolls over on its
       own, no cron needed); a `lead_activities` table (call/whatsapp/note,
       timestamped) with a per-lead expandable panel in `CrmTable`
       (migration `20260809110000_phase14_lead_activities.sql`); search +
       status/source filter + sort controls in `CrmTable` (client-side);
       and two new portal tabs via `components/portal-tabs.tsx` +
       `app/client/[clientId]/layout.tsx`-adjacent pages: `/notifications`
       (leads whose `follow_up_at` is due today or overdue, open-status
       only, with an inline reschedule/mark-done control) and
       `/automations` (WhatsApp automation preview + edit, reusing the
       existing `StepsEditor` + `updateAutomation` action — only shown if
       the client has at least one automation). While wiring
       `updateAutomation` into the portal, fixed a latent cross-tenant bug:
       it only scoped its update by automation `id`, not `client_id`, so a
       crafted request with a spoofed client_id could have edited another
       client's automation; now scoped by both plus `assertCrmAccess`,
       matching the pattern every other client-reachable mutation in
       `lib/actions/leads.ts` already followed.
     - **Added 2026-08-09 (same day, follow-up ask):** an "כניסה כלקוח 🔑"
       button next to the create/refresh-CRM action
       (`enterAsClientAction` in `lib/actions/client-auth.ts`) that mints a
       portal session cookie the same way a real login does — bound to
       whatever `crm_password_hash` is current — without ever needing to
       know the client's password. Live-verified it keeps working even
       after the client changes their own password from inside the
       portal. This replaced the user's original ask ("show me his
       password on my dashboard"): that would have required switching
       password storage from one-way hashing to reversible encryption
       (real risk — a DB/secret leak would expose every client's real
       password). The impersonation button gets the same outcome ("easily
       enter") with no security downgrade, and the user agreed to this
       over the password-display option when asked.
   - ✅ **2b — Webhook/automation intake** — done 2026-08-09.
     `apps/web/app/api/webhooks/meta-leads/route.ts` now resolves a Meta
     `ad_id` → `ads.meta_id` → `adsets` → `campaigns` → `client_id` (only
     works once that ad has been synced via `lib/meta/sync.ts` — an
     unsynced `ad_id` is logged and skipped, not fatal). `leads.meta_leadgen_id`
     (new column, unique when non-null) makes retried Meta deliveries a
     no-op instead of a duplicate lead. Generic intake for external tools
     (Make/Zapier/n8n/any form) lives at
     `apps/web/app/api/webhooks/leads/[clientId]/route.ts` — each client
     gets their own URL + secret (`clients.webhook_secret`, new column),
     shown/regenerated on their edit page next to the portal password UI.
     POST body maps `name`/`full_name`, `phone`/`phone_number`, `email` to
     lead columns; every other key lands in `leads.custom_fields`.
     Live-verified: real curl POSTs to both webhooks created leads visible
     in the CRM, wrong-secret request got a 401, and a duplicate
     `leadgen_id` delivery didn't create a second lead. Migration:
     `supabase/migrations/20260809090000_phase12_lead_intake_webhooks.sql`.
   - ✅ **2c — Weekly campaign questionnaire** — done 2026-08-09 (migration
     applied and verified). Admin
     template editor at `/questionnaires`: one global template
     (`questionnaire_templates.client_id is null`, seeded by the migration
     with 6 Hebrew questions) plus an optional per-client override that
     wins when present — two partial unique indexes enforce
     "exactly one global, at most one per client". Question rows are
     edited with `components/questionnaire-editor.tsx` (label / type
     text|textarea|number|rating / required / reorder), serialized to JSON
     in a hidden input the same way `DriveLinksEditor` works. Clients fill
     it at `/client/[clientId]/questionnaire` (new portal tab), one row per
     (client, week) upserted on `client_id,week_start` so re-submitting the
     same week edits instead of stacking; past weeks are listed read-only
     below the form. The admin page shows every client with a
     מילא/לא מילא השבוע badge and all their past answers. MCP tool
     `get_questionnaire_responses` (`apps/mcp-server/src/tools/
     get-questionnaire-responses.ts`) returns answers already paired with
     their question text — answers are stored keyed by question id, so raw
     rows are unreadable without resolving the template.
     - **`week_start` is the SUNDAY of the week**, matching the Israeli
       Sun–Thu work week (the user chose this over the Monday the migration
       was first drafted with, before any real responses existed). Computed
       by `weekStartIso()` in `apps/web/lib/crm/questionnaire-week.ts`; the
       phase-18 migration comment and `QuestionnaireResponse.week_start` in
       `packages/shared` document the same rule. Every writer must agree —
       the unique index is on `(client_id, week_start)`, so a disagreeing
       writer would let one week produce two rows.
     - Pure helpers live in `lib/crm/questionnaire-week.ts` (no
       `server-only`, unit-tested in `lib/crm/__tests__/`); the Supabase
       template lookup is in `lib/crm/questionnaire.ts`, which re-exports
       them so callers have a single import.
3. ✅ **Goals page** — done today. `/goals`: client count (current total),
   revenue and lead count (current calendar month), editable target per
   metric, live actual computed from `clients`/`client_payments`/`leads`.
   Client payment log (`תשלומים`) added to each client's edit page, feeds
   the revenue actual.
4. ✅ **Personal/agency CRM** — done 2026-08-09 (migration applied and
   verified). `/agency-crm`, backed by its own `agency_leads` table —
   deliberately NOT the `leads` table, because those are per-CLIENT rows
   with client-customizable statuses/columns, whereas the agency's own
   pipeline is a fixed agency-wide status set (new → contacted → meeting →
   proposal → won/lost) with no `client_id` and no portal exposure. Own
   `AgencyCrmTable` component for the same reason — `CrmTable` is built
   around the customizable-status model and doesn't fit. Inline-editable
   cells, search + status filter + sort, four stat tiles (open leads, open
   pipeline value, deals closed this month, revenue this month). `closed_at`
   is stamped on entering won/lost and cleared on leaving them, so
   "this month" recomputes live with no cron — same rule `leads` uses.
5. ✅ **Funnels page** — done 2026-08-09 (migration applied and verified).
   `/funnels`: name, stage (TOFU/MOFU/BOFU), status, optional client,
   description, drive/materials links (reuses `DriveLinksEditor` unchanged —
   the migration kept `funnels.drive_links` in the exact jsonb shape
   `clients.drive_links` uses), and a many-to-many campaign link via
   `funnel_campaigns`. The join table exists so `campaigns` stays free of
   app-owned columns that `lib/meta/sync.ts` would clobber on the next sync.
   Campaign links are replaced wholesale (delete-then-insert) on save —
   the join row carries no payload, so diffing would buy nothing.
6. ✅ **Notes feed** — done 2026-08-09 (migration applied and verified).
   `/notes`: reverse-chronological feed grouped by date, with a
   client/funnel filter panel (`lg:flex-row-reverse`, so it sits on the
   left in this RTL layout). Filters are URL search params, so a filtered
   view is linkable. `note_date` is backdatable and distinct from
   `created_at`; it's rendered from UTC midnight on purpose so a bare
   `date` column doesn't shift a day under the local timezone.
7. ✅ **"Business tasks"** — done today, but note the split:
   - `/missions/business` = one-off tasks the user manually adds
     (title/due date/priority/status) — reuses the `missions` table with
     `client_id` now nullable (`null` = business task, non-null = a
     client's task). The `/missions` page (client tab) filters
     `client_id is not null` so these don't leak across tabs.
   - `/missions/daily` = a DIFFERENT feature, recurring daily checklist
     (separate `daily_tasks`/`daily_task_completions` tables — completions
     are dated rows so history survives day rollover, no reset job
     needed). Dashboard has a "עקביות יומית" tile linking here, showing
     today's completion %.
   - These two were confused once mid-session (daily checklist was first
     built under the "business tasks" label/route) — now correctly split
     into separate tabs via `apps/web/components/missions-tabs.tsx`
     (`active: "clients" | "business" | "daily"`).

## Phases 15–18: applied and verified 2026-08-09

All four migrations are **applied to the live project** and the features
were verified against it:

```
20260809120000_phase15_agency_crm       ✅ applied
20260809130000_phase16_funnels          ✅ applied
20260809140000_phase17_notes            ✅ applied
20260809150000_phase18_questionnaires   ✅ applied (global template seeded)
```

Verified: all six tables exist; `/agency-crm`, `/funnels`, `/notes`,
`/questionnaires` all return 200 with no render errors and the seeded
Hebrew questions appear; nav links resolve; the portal's
`/client/[id]/questionnaire` 307-redirects to the login page when there's
no session (auth guard intact). The `questionnaire_responses` upsert was
exercised directly against the live DB — two submissions for the same
(client, week) collapse to one row with the later answers, confirming
Postgres infers `questionnaire_responses_client_week_idx`. The test row
was deleted; all four new tables are empty.

Two CLI notes worth keeping:

- The Supabase CLI needs `SUPABASE_ACCESS_TOKEN` (a **personal access
  token** from https://supabase.com/dashboard/account/tokens — not the
  anon/service-role keys in `.env.local`). Without it, `supabase db push`
  and `migration list` **hang indefinitely with no output** instead of
  printing an auth error. A silent hang IS the auth failure — don't
  debug it as anything else.
- `npm run dev` from a session where port 3000 is already taken silently
  moves to 3001. Check the startup log before concluding a change "didn't
  show up".

The 6 new tables are registered in
`packages/shared/src/database.types.ts` — that file's `Database["public"]
["Tables"]` map is hand-written, and a table missing from it makes every
query on it fail typecheck. Add new tables there whenever a migration adds
one.

## Phase 19: applied and verified 2026-08-10

`20260810120000_phase19_webhook_mapping_reports.sql` is **applied to the
live project**, and phases 15–19 are all merged into `main` (the feature
branches are deleted). `migration list` shows local == remote for all 18
migrations.

Verified against the live DB, not just locally:

- `webhook_field_mappings` exists; `weekly_reports.period_kind` /
  `period_end` exist.
- The old `(client_id, week_start)` unique constraint really is gone —
  proven behaviourally by inserting a weekly AND a monthly report sharing
  one start date (the collision the old constraint would have blocked).
  The replacement three-column index still rejects a true duplicate
  (`23505`). Test rows deleted.
- The webhook mapping was exercised end-to-end through the running dev
  server against a real client: built-in fields still map with no config,
  a mapped question lands under the **column id** (so it renders in the
  CRM — the bug this feature fixes), an `ignore` mapping is dropped, and
  an unmapped key survives under its raw name. All test data, the temp
  column and the temp `webhook_secret` were removed afterwards.
- `/clients/[id]`, `/funnels`, `/campaigns`, `/crm`, `/reports`, `/notes`,
  `/questionnaires`, `/agency-crm` → 200 with no errors in the dev log;
  portal `/client/[id]/reports` and `/questionnaire` → 307 to login
  without a session.

Gotcha worth keeping: **the phase-19 migration drops a constraint by
name** inside a `do $$` guard. It matched here, but if `weekly_reports`
is ever restored from a dump with renamed constraints, re-check with
`select conname from pg_constraint where conrelid =
'weekly_reports'::regclass;`.

The portal's דוחות tab only appears once a report has actually been
*sent* (`sent_at` set) — an empty portal tab is not a bug.

What phase 19 added, all against the same live schema conventions:

- **Client funnels tab** (`/clients/[id]/funnels`) — the client's funnels,
  each with a קמפיינים section showing per-campaign spend/leads/CPL/
  clicks/impressions/CTR/CPC/CPM over a trailing 30 days.
- **Shared metrics helper** (`lib/metrics/`): `campaign-stats.ts` is pure
  and unit-tested; `fetch-stats.ts` does the campaigns→adsets→ads→
  `ad_metrics_daily` walk that three pages used to duplicate. It **pages
  through `ad_metrics_daily`** — Supabase caps API responses at max-rows
  (1,000 by default) and would otherwise silently understate spend.
- **⚠️ "Views" means impressions.** `ad_metrics_daily` has no video-view
  column and `lib/meta/sync.ts` never pulls one. Everywhere the UI says
  צפיות it is impressions. Real view counts need a sync change first.
- **Per-client activity log** on the client profile, left-hand column
  (second child of a plain flex row = left in an RTL document). The
  standalone `/notes` page is unchanged; both write through the same
  actions.
- **Configurable webhook structure** (`lib/crm/webhook-mapping.ts`, pure +
  tested). This closed a real data-loss bug: the CRM table renders
  `custom_fields` keyed by `lead_columns.id`, but the webhooks stored
  extras under their RAW key, and the Meta webhook **discarded every
  lead-form question except full_name/phone_number/email**. Mappings are
  edited in the CRM panel (admin only — not shown in the client portal),
  with already-seen-but-unmapped keys offered as suggestions.
- **Questionnaire is now once-a-week**: filled → the form is replaced by a
  confirmation (editing stays behind a toggle), and the portal tab is
  marked with a • only while it's pending. The current week's answers
  show on the client's admin profile.
- **Client reports** (`lib/reports/`, pure + tested): weekly OR monthly,
  built from real aggregates plus the client's free-text questionnaire
  answers, editable before sending. **"Sending" = publishing**: setting
  `sent_at` is what reveals the report in the portal's new דוחות tab.
  There is no email/WhatsApp delivery wired up; the text is plain so it
  can be pasted anywhere.

Note on `weekly_reports`: `week_start` keeps its name but now means "first
day of the period" — the 1st for a monthly report. Rows written before
phase 19 have `period_kind = 'week'` (column default) and a null
`period_end`.

## New idea, not yet scoped or built

User wants (their words, roughly): content/insights for their OWN
Instagram page via the Meta app they already connected — pull all
Instagram data/metrics, plus the ability to schedule posts (reels or
regular posts) they add. This would need the Instagram Graph API
(separate from the Marketing API already used for ad sync) — content
publishing scope, media upload, a scheduler. Not brainstormed yet — needs
its own spec before building.

## Session-management notes for whoever picks this up

- The user gets frustrated fast by process overhead (multi-round
  brainstorming, long subagent-driven-development ceremony) when they
  just want to see things move. Later phases (Goals page, missions split)
  were built directly — light clarifying questions, then straight to
  code — no separate spec doc, no subagent loop. Match that pace unless
  the user asks for more rigor.
- Always verify against the LIVE Supabase project in the browser preview
  after schema changes — typecheck/vitest passing is necessary but not
  sufficient; this project has caught real bugs (stale `.next` cache,
  wrong env file location, migration-vs-existing-data) that only showed
  up when actually clicking through the running app.
- `.superpowers/sdd/*` directories are gitignored scratch workspaces from
  the subagent-driven-development runs for sub-projects 1 and 2a — safe
  to ignore/delete, the real record is in git history
  (`git log --oneline`).
