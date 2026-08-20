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

## Phase 20: Instagram insights + video review — BUILT, NOT YET VERIFIED LIVE

Two features built in parallel by two subagents on 2026-08-12, on a
foundation (migration, domain types, IG client, nav) written first by the
lead so the agents never touched the same files. Migration
`20260812100000_phase20_instagram_video_review.sql` is **written but NOT
applied** — see the blockers at the end.

### Correction to the note this section replaced

The old text said this would run "via the Meta app they already
connected". **There is no connected Meta app.** `META_USE_MOCK=true` and
all five clients have `meta_ad_account_id` and `meta_access_token` set to
null — the entire ad-metrics side of the dashboard runs on
`lib/meta/mock-client.ts`. Do not assume real ad data exists anywhere.

### 20a — Instagram insights

Reached through **hookmyapp**, not a Meta app of our own. The agency's
Instagram (`liorgabay.media`, IG user id `17841468760275702`, a BUSINESS
account) is connected as hookmyapp channel `ch_iTvY8c50`.
`hookmyapp channels env ch_iTvY8c50` prints the credentials:

    INSTAGRAM_GRAPH_API_URL = https://gateway.hookmyapp.com/meta/v25.0
    INSTAGRAM_ACCOUNT_ID    = 17841468760275702
    INSTAGRAM_ACCESS_TOKEN  = <hookmyapp channel token>

This means **no Meta app, no OAuth, no app review** — the gateway speaks
ordinary Graph API. Three traps, all verified live against the gateway:

- Auth is `Authorization: Bearer`, **not** the `access_token` query
  parameter Meta's own docs use. The query param returns
  `401 MISSING_BEARER`.
- Paging must follow `paging.cursors.after`, never `paging.next` — the
  absolute `next` URL points at Meta and bypasses the gateway's auth.
- Insights responses carry `title`/`description` in **Dutch**. Never
  render them; the UI uses its own Hebrew labels.

Metrics are nullable end to end on purpose: Meta returns metrics it will
not serve in an `unavailable[]` list rather than erroring, and the account
has 27 followers so demographics are suppressed. **Null means "Meta didn't
give us this", never 0.** Data lags up to 48h, so the sync re-reads a
14-day trailing window and upserts.

#### The insights edge answers in TWO shapes — this cost three bugs

Found only by running the sync for real against the live gateway; all three
were invisible to typecheck, unit tests AND the route smoke, because each
one failed into a `catch` that returned null and a null is indistinguishable
from Meta legitimately withholding a metric.

1. **`reach` returns a daily series** (`values[]`, each with `end_time`).
   **`views`, `total_interactions` and `profile_views` return nothing at
   all** unless you pass `metric_type=total_value`, and then only ONE
   aggregate for the whole range. Without it the response is literally
   `{"data":[]}`. To get a daily series out of the second group you must ask
   day by day with `since=D&until=D+1` — `since === until` is treated as a
   zero-length range and returns empty. One request per day; fine on a cron.
2. **Media insights hang off the MEDIA node, not the account.** The client's
   `igGet` prefixes the account id, so `igGet("<mediaId>/insights")` built
   `/{account}/{media}/insights` and 404'd for every post. Use `igGetNode`.
   Before the fix all three posts had null metrics and `metrics_synced_at`
   unset; after, the top video reads 680 views / 441 reach / 28 likes.
3. **`followers_count` was pinned to "today"** — but insights lag means the
   newest row is routinely yesterday or older, so it matched no row and was
   never stored. It now attaches to the newest date present.

**Lesson for the next metric added here:** a swallowed error and a genuinely
unavailable metric look identical downstream. Verify a new metric against
the live gateway with curl before trusting a null.

Files: `lib/instagram/{client,metrics,insights,fetch-insights}.ts`,
`app/api/cron/instagram-sync/route.ts`, `app/(admin)/instagram/page.tsx`.

### 20b — Drive-backed video review

Frame.io-style: clients watch their ad videos and leave fixes pinned to an
exact second, as text and freehand drawing; the agency sees every fix per
video. Videos are **not uploaded** — they are read from a Google Drive
folder per client (`clients.drive_folder_id`).

- **Drive auth is a public "anyone with link" folder + `GOOGLE_API_KEY`.**
  The owner chose this over a service account after being told the folder's
  videos become link-reachable by anyone. It sits behind a one-function
  seam in `lib/videos/drive.ts` so switching later is a one-file change.
- `/api/videos/[id]/stream` **must** forward `Range` and return 206 —
  without it seeking breaks silently and the whole timecode feature is
  dead. This is the load-bearing path and it is **not yet proven at
  runtime** (no API key, no applied migration).
- Drawing coordinates are stored **normalised 0..1** against the display
  box, so annotations don't drift between a phone and a desktop player.
- `timestamp_seconds` is numeric, never rounded — a fix at 12.4s must not
  snap to 12s or reviewer and editor are on different frames.

### Security fix applied to the subagent's work — read this before touching the stream route

The agent originally guarded the stream route by copying `assertCrmAccess`:
pass when there is **no** portal session cookie, 403 when the cookie belongs
to another client. That contract is fine for server actions behind the
open-by-design admin pages, but on a public GET it inverts the protection —
a portal client could **delete their own cookie** and then stream any other
client's footage by UUID. Only logged-in clients would have been
constrained.

Replaced with `lib/videos/stream-grant.ts`: a short-lived (6h) HMAC grant
scoped to ONE video id, minted server-side by the pages that already know
the caller is entitled, and passed in the `<video>` src. The route accepts a
valid grant **or** a session cookie owning the video, and treats absence of
evidence as no permission. Grant is checked first so an admin using the
"enter as client" shortcut isn't 403'd by a stale cookie for another client.
15 tests in `lib/videos/__tests__/stream-grant.test.ts`.

Note this weakness is **systemic, not local**: `assertCrmAccess` still has
the "no cookie means admin" shape everywhere else it is used. That is
tolerable only while the admin dashboard has no login and runs on one
machine. Revisit together with admin auth.

### A second instance of the same bug class, in the write path

`addVideoComment` took `clientId` AND `videoId` as separate caller-supplied
arguments and authorised with `assertCrmAccess(input.clientId)`. A portal
client could post **another client's videoId alongside their own clientId**:
the cookie matched, the check passed, and the comment landed on a video they
cannot see (the portal page fetches comments by `video_id` alone, so the
victim would render it). Fixed by reading `client_id` from the video row —
the two ids must agree and only the database knows which is true.
`resolveVideoComment` likewise no longer takes the client id as an argument.

**The lesson for anything added here later:** an id supplied by the caller
can be checked against the session, but it cannot be checked against another
caller-supplied id. Derive ownership from the row.

### Verification status

- `npm run typecheck` clean; `npm test` → **159 passing**; `next build`
  succeeds with all four new routes.
- Browser smoke on 2026-08-12 caught two things typecheck and vitest could
  not, both from the unapplied migration:
  `/instagram` returned **500** (`fetch-insights.ts` threw on the missing
  `ig_daily_metrics`) and `/clients/[id]/videos` returned **404** (it named
  `drive_folder_id` in a select, so the whole client row came back null).
  Fixed with `lib/supabase/schema-state.ts` (`isMissingSchemaError`, narrow
  to the four not-in-schema codes) and by selecting `*` on the client row.
  Both now 200 with a clean empty/setup state, no errors in the dev log.
  **This is why the smoke step is not optional in this repo.**
- **Run tests as `npm test`, not `npx vitest run` from the repo root.** The
  `@/` alias lives in `apps/web/vitest.config.ts`, so a root invocation
  fails to resolve `@/lib/format` and reports a phantom failure in
  `lib/reports/__tests__/periods.test.ts`. Both subagents were fooled by
  this and reported it as a pre-existing break. It is not.
### Applied and verified live, 2026-08-12

- Migration **applied** to project `ykqmhkzletbaisqsjesv`; `migration list`
  shows local == remote for all 19.
- Schema verified behaviourally against the live DB (13 checks, all pass,
  every test row cleaned up): four tables + `clients.drive_folder_id`
  reachable; a partial metrics row keeps absent metrics null rather than 0;
  the `(ig_account_id, date)` index rejects a duplicate (`23505`);
  `duration_seconds` stays null rather than 0; `timestamp_seconds` keeps its
  fraction (12.4 stored, not 12); a normalised drawing round-trips through
  jsonb byte-identical; the `author_kind` check rejects an unknown kind
  (`23514`); deleting a video cascades to its comments.
- **The Instagram sync has now run for real** against the live gateway:
  13 daily rows, 3 posts, all metrics populated. `/instagram` renders the
  real numbers (680/441/99/34/27) with correct Hebrew labels, 200, no errors.
- Instagram credentials are in `apps/web/.env.local`, pulled from
  `hookmyapp channels env ch_iTvY8c50`.

### Phase 20b, 2026-08-16 — the folder had no way in

`drive_folder_id` shipped with **no write path at all**: no form field, no
action, no argument anywhere. The column existed, the sync read it, and the
videos tab told the owner to "add it in client edit" — where it did not
exist. The whole Drive half was unreachable without hand-editing the
database, and nothing caught it because every layer was individually
correct.

- `lib/videos/drive-folder.ts` — `parseDriveFolderId` collapses every shape
  Drive hands out (`/drive/folders/<id>?usp=sharing`, the `/drive/u/0/`
  multi-account variant, legacy `open?id=`, a bare id) to the id. Nobody
  copies an id; they copy the address bar. **Storing the URL raw would not
  error** — `files.list?q='<url>' in parents` just matches nothing, so the
  sync would report "0 videos" on a full folder. Invalid input throws rather
  than storing something that fails silently later. Empty → `null`, never
  `""` (`Boolean("")` is false but `"" != null` is true, and the two would
  disagree about whether a folder is configured). 10 tests.
- Field added to `/clients/[id]/edit`, wired through `UpdateClientInput`;
  the videos-tab empty state now links there instead of naming a column.
- Write path verified against the live DB: probe value written to a real
  client, read back identical, reverted to `null`. No schema surprise.
- `lib/videos/stream-response.ts` — the header whitelist and status
  passthrough were extracted out of the route so seeking is testable
  **without Drive credentials**, matching this repo's pure-function test
  convention (there is no `vi.mock` anywhere in the codebase). 13 tests pin
  the parts that fail silently: `Accept-Ranges` is advertised even on a full
  200 (the browser will not send a Range request until it has seen it, so
  omitting it kills seeking before the 206 path is ever reached);
  `Content-Range` survives on a 206; a 206 is not treated as a failure; and
  `content-encoding`/`set-cookie`/CORS/`x-goog-*` are dropped.

### Verified live end to end, 2026-08-20 — Drive seeking works

`GOOGLE_API_KEY` supplied and added to `apps/web/.env.local` (gitignored).
Folder `1x-n17...` set on **ליאב כהן** by the owner through the new edit
field — the write path's first real use was theirs, not a test.

Both Drive-side unknowns resolved **favourably**, and neither could have
been answered without the key:

- **`files.get?alt=media` DOES honour Range under API-key auth.** Returns
  `206` + `Content-Range` on a plain key, no OAuth needed.
- **Large public files do NOT trip the virus scan here.** A 127 MB `.mov`
  served bytes normally — no `cannotDownloadAbusiveFile` 403. Worth
  re-testing if files grow much past that; the threshold is undocumented.

Proven through the running app (real server action, invoked over the
`Next-Action` protocol rather than a reimplementation of it):

- Sync pulled **6 videos**, all with real durations (32.3s–107.3s), sizes
  (39.7–127.8 MB) and thumbnails. Re-running it left the row count at 6 —
  the `(client_id, drive_file_id)` upsert is idempotent.
- Stream route: `200` + `Accept-Ranges: bytes` on a full request;
  `206` + `Content-Range: bytes 0-99/69321619` at the head; `206` +
  `bytes 20000000-20000099/69321619` on a **mid-file seek**.
- **Byte integrity:** the same mid-file range fetched through the proxy and
  straight from Drive are sha256-identical. The proxy is not mangling the
  stream.
- **Grant enforcement, all three ways in refused:** no grant → 403;
  tampered signature → 403; and *another video's currently-valid grant* →
  403, confirming the grant is bound to the video id in the URL path rather
  than to the bearer.
- Sanity check that fell out of probing the action ids: `addVideoComment`
  and `resolveVideoComment` both rejected a client id passed where a
  video/comment id belongs, which is the ownership-derivation fix holding.

Still done by eye only: watching the scrub bar move in a real browser. The
206s, the offsets and the byte-identical hashes are the mechanism behind
seeking, so this is now a formality rather than an open risk.

### Nothing schedules the cron routes

There is no `vercel.json` and no scheduler config in the repo — every
`/api/cron/*` route is triggered externally, presumably the n8n/Make setup
the `CRON_SECRET` comment implies. Whoever owns that scheduler still needs
to add `instagram-sync` to it (README now lists it); no scheduling
infrastructure was added here, because the owner asked for a button, not a
scheduler.

**Instagram now has a manual escape hatch.** `/instagram` used to tell you
to "run the daily cron" with no way to do so — the owner hit exactly that
message and could not find the cron, because there isn't one. There is now
a "סנכרן עכשיו" button (`components/instagram-sync-button.tsx` →
`lib/actions/instagram.ts`) calling the same `syncInstagramInsights()` the
route calls. As a server action it needs no `CRON_SECRET`, which also
sidesteps the fact that `verifyCronSecret` returns false whenever
`CRON_SECRET` is unset. Note `syncInstagramInsights()` RETURNS
`{ synced: false, reason }` rather than throwing when Instagram is
unconfigured — the action checks that explicitly, or the button would
report success having done nothing.

## Phase 23 — cross-client campaigns list + CRM campaign dashboards

`/campaigns` (`app/(admin)/campaigns/page.tsx`, nav entry "קמפיינים") lists
every campaign across every client with 30-day spend/leads/CPL/CTR, filters
by פעילים / לא פעילים / הכל, and sorts by spend, leads, CPL, name or client
— all via `?status=&sort=` searchParams, so a filtered view is linkable and
the page stays a server component.

Each row carries two checkboxes ("ה-CRM שלי" / "CRM הלקוח") backed by
`campaigns.show_in_agency_crm` and `campaigns.show_in_client_crm`
(migration `20260819130000_phase23_campaign_crm_dashboards.sql`). A pinned
campaign renders a `<CampaignCrmDashboard>` — the same `CampaignStatsTable`
the campaigns tab uses — on `/agency-crm`, `/clients/[id]/crm` and the
client portal `/client/[clientId]/crm`. All three go through
`lib/metrics/crm-campaigns.ts` so the window can't drift. The dashboard
renders **nothing** when no campaign is pinned, rather than an empty card on
every CRM forever.

Booleans rather than a join table like `funnel_campaigns`: this is a
visibility flag with two fixed destinations, not membership in a
collection. Writes go through `setCampaignCrmVisibility` in
`lib/actions/campaigns.ts`, guarded by the new
`lib/auth/assert-agency-access.ts` (the mirror of `assertCrmAccess` —
rejects portal sessions outright) because pinning to the client surface
publishes spend into the portal. That exposure is consistent with what
clients already see: `lib/reports/build-report.ts` puts total and
per-campaign spend/leads/CPL in every published weekly report.

### `campaigns.status` now holds the real Meta status

This was load-bearing and easy to miss. `lib/meta/sync.ts` used to hardcode
`status: "ACTIVE"` on insert and never refresh existing rows, and the
insights edge carries no status field at all — so every campaign in the DB
read ACTIVE and the "לא פעילים" filter would have shipped permanently
empty. `MetaClient` grew `fetchCampaignStatuses()` (one paged request per
account against the `/campaigns` edge, `fields=id,name,effective_status`),
and `findOrCreateCampaign` now writes it on insert **and updates it on
re-sync** so a campaign paused in Ads Manager stops reading ACTIVE here.
If that request fails the map is `null` and existing statuses are left
alone — a fetch failure must not overwrite real data with a guess.

`MockMetaClient` now emits two campaigns, one ACTIVE and one PAUSED
(`META_USE_MOCK` defaults to true), so the filter has something to filter
in the demo. Compare statuses only through
`lib/metrics/campaign-status.ts` — the column has no check constraint and
Meta's vocabulary includes ARCHIVED, PENDING_REVIEW and friends.

Adsets and ads still hardcode `status: "ACTIVE"` on insert. Nothing filters
on those yet, so it was left alone deliberately; fix it the same way if an
adset/ad-level filter ever lands.

Two known limits, neither a today problem: `/campaigns` passes every ad id
across every client into `fetchMetricRows`, which pages ROWS but not the
`.in("ad_id", …)` list — at ~20 clients that query string approaches the
PostgREST/proxy URL length limit (same neighbourhood as the max-rows note in
`lib/metrics/fetch-stats.ts`). And the `clients(name)` embed in
`fetchAllCampaigns` throws rather than degrading if postgrest can't resolve
the FK, so `/campaigns` is the first page to load after applying the
migration.

**Not verified against live data.** The migration is written but unapplied
(no Docker/Supabase CLI and no `.env.local` on this machine).
`npm run typecheck`, `npm run test` and `npm run build` are green, which
this file already warns is necessary and not sufficient.

## Still not built

Instagram post scheduling (reels/regular posts). Deliberately deferred —
the owner chose insights first. Note hookmyapp's publish has **no
scheduling** and its media containers expire after 24h, so the scheduler
would have to live in this app (`CRON_SECRET` and the cron pattern already
exist), and Meta must fetch media from a **public HTTPS URL**, which means
a public Supabase Storage bucket.

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
