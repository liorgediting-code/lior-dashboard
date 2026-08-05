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
   - ⬜ **2b — Webhook/automation intake** — NOT started. Finish the
     Meta-leads webhook's unresolved ad→client resolution TODO
     (`apps/web/app/api/webhooks/meta-leads/route.ts`), make lead intake
     work generically for external automation tools (Make/Zapier/n8n)
     hitting a client-specific webhook URL.
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
