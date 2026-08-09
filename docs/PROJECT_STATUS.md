# Project Status — dashboard-lior ("LiorEdits")

Last updated: 2026-08-05. Written so a future session (or a fresh context
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
   - ⬜ **2c — Weekly campaign questionnaire** — NOT started. Template
     (global + per-client override), client fills it in the portal,
     answers viewable in the dashboard and AI-analyzable, exposed as a new
     MCP tool (`apps/mcp-server`).
3. ✅ **Goals page** — done today. `/goals`: client count (current total),
   revenue and lead count (current calendar month), editable target per
   metric, live actual computed from `clients`/`client_payments`/`leads`.
   Client payment log (`תשלומים`) added to each client's edit page, feeds
   the revenue actual.
4. ⬜ **Personal/agency CRM** — NOT started. Separate from the client CRM
   built in 2a — for the agency's OWN leads/prospects.
5. ⬜ **Funnels page** — NOT started. For the agency's own business:
   campaign ↔ funnel, notes, drive/materials links.
6. ⬜ **Notes feed** — NOT started. Dated, per client/funnel, left-side
   panel.
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
