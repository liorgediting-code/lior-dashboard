# Client CRM Portal — Design

## Context

This is sub-project 2a of the larger roadmap started in
[2026-08-04-settings-and-json-forms-design.md](2026-08-04-settings-and-json-forms-design.md).
It replaces the fixed 5-stage lead kanban (`new → contacted → qualified → won/lost`)
with a Monday-style table that each client fully customizes — their own status
labels and their own extra columns — and adds real password-based login so a
client can view and manage their own leads directly, without going through the
agency.

### Roadmap (for context, not in scope here)

1. ✅ Settings + JSON forms (done)
2. **Client CRM portal** (this spec — split into 2a/2b/2c):
   - **2a — Client portal + Monday-style CRM** (this document): login, custom
     statuses, custom columns, unified table.
   - **2b — Webhook/automation intake**: finish the Meta-leads webhook's
     unresolved ad→client resolution TODO, and make lead intake work
     generically for external automation tools (Make/Zapier/n8n) hitting a
     client-specific webhook URL.
   - **2c — Weekly campaign questionnaire**: template (global + per-client
     override), client fills it in the portal, answers viewable in the
     dashboard and AI-analyzable, exposed as a new MCP tool.
3. Goals page (personal goals + amount paid per client + auto-calculated
   goals from dashboard data)
4. Personal/agency CRM (separate from the client CRM built here)
5. Funnels page for the agency's own business (campaign ↔ funnel, notes,
   drive/materials links)
6. Notes feed (dated, per client/funnel, left-side panel)
7. "Business tasks" — personal task list under the missions page

### Pre-launch assumption

This app has no real production data yet (fresh repo, no deployed instance,
no remote). The schema changes below are written as a clean redesign, not a
careful backward-compatible data migration — `supabase/seed.sql`'s demo data
is rewritten to match the new schema rather than backfilled.

---

## A. Data model

**New table `lead_statuses`** — each client's own status list:

- `id uuid pk`
- `client_id uuid fk clients(id)`
- `label text` — client-editable display name
- `kind text check in ('open', 'won', 'lost')`
- `sort_order int`
- `is_default boolean` — true on exactly one `open` status per client; new
  leads (manual or webhook) land here

Every client always has **exactly one `won` row and one `lost` row**,
created automatically and enforced app-side as undeletable (label is
editable, `kind` is not). Any number of `open` rows exist beyond that, fully
managed by the client (add/rename/delete/reorder), because revenue and
close-rate math (`kind = 'won'`) doesn't care how many open stages exist or
what they're called.

**New table `lead_columns`** — each client's custom fields:

- `id uuid pk`
- `client_id uuid fk clients(id)`
- `name text`
- `type text check in ('text', 'number')`
- `sort_order int`

**`leads` table changes:**

- `stage` (the old 5-value enum) → replaced by `status_id uuid fk lead_statuses(id)`
- add `email text` (currently missing entirely — the lead intake explicitly
  needs name + phone + email as built-in fields)
- add `custom_fields jsonb not null default '{}'` — keyed by `lead_columns.id`,
  values are `string | number` matching the column's `type`
- `closed_at`, `deal_value` stay as-is, still auto-set on a status change —
  but now driven by the new status's `kind` (`won`/`lost`), not a literal
  string match

**Client creation** (`createClient`) seeds a default status set mirroring
today's stages: חדש (open, default) → בקשר (open) → מוסמך (open) → נסגר
(won) → אבד (lost). The client can freely edit everything except the last
two rows' `kind`.

## B. Calculation call sites updated from `stage = 'won'` to `kind = 'won'`

These currently read the literal string `"won"` and must instead resolve
through `lead_statuses.kind`:

- `fn_client_current_metrics` (Postgres function, `supabase/migrations/20260803120200_phase3_leads_crm_reports.sql`) —
  join `leads` to `lead_statuses` and filter `kind = 'won'` instead of
  `stage = 'won'`.
- `apps/web/lib/analyzer/monthly-recalc.ts:41-46` (`recalcClientMaxCpl`'s
  won-`deal_value` query) — look up the client's `won` status id, filter by
  `status_id`.
- `apps/web/app/page.tsx:16` (dashboard revenue/ROI) — same pattern.
- `apps/web/lib/actions/leads.ts` `updateLeadStage` — instead of checking
  `stage === "won" || stage === "lost"`, look up the target status's `kind`
  and auto-set `closed_at` (both kinds) / `deal_value` (won only) based on
  that.

## C. Client authentication

- `clients.crm_password_hash` already exists in the schema (bcrypt-style
  hash) — no new column needed, just a real implementation behind it.
- **Login route** `/client/[clientId]/login`: password form, verifies
  against `crm_password_hash`, on success sets a signed, `httpOnly` session
  cookie scoped to that client (`clientId` + expiry + HMAC signature using a
  new `SESSION_SECRET` env var), 30-day expiry.
- **Route protection**: Next.js middleware guards `/client/[clientId]/*`
  (except `/login`), redirecting to the login page when the cookie is
  missing/invalid/expired. Critically, the middleware also checks that the
  cookie's `clientId` matches the `[clientId]` in the requested URL — a
  logged-in client must not be able to view another client's data just by
  editing the URL. This is the app's first real external-facing auth
  boundary (every other route trusts the service role fully with no
  per-user scoping), so this check is load-bearing, not a nicety.
- **Admin side** (`/clients/[id]/edit`): shows the client's portal URL and
  current password status, with a "צור סיסמה חדשה" button that generates a
  new strong random password, hashes it, and displays the new plaintext
  password once (for the admin to copy/share manually — no auto-send in
  this phase, per your earlier answer).
- **Client-side password change**: a settings action inside the portal lets
  the client set their own password, with an inline Hebrew warning that a
  weaker/reused password makes it easier for someone else to see their
  leads.
- The client-facing stub at `apps/web/app/client/[clientId]/crm/page.tsx`
  becomes the real, authenticated portal page.

## D. Unified Monday-style table

One shared table component renders in two places with identical
functionality — the only difference is the route wrapper (authenticated
portal vs. open internal dashboard, matching how every other internal page
already has no login):

- `/clients/[id]/crm` — agency's internal view (no login, like the rest of
  the internal dashboard)
- `/client/[clientId]/crm` — client's portal (behind the new login)

**Columns:** name, phone, email, status (colored pill — green tone for
`won`-kind, red tone for `lost`-kind, neutral for `open`-kind), created
date, then the client's custom text/number columns in `sort_order`.

**Row interactions:**
- Inline click-to-edit on every editable cell (name/phone/email/status/custom
  fields) — status renders as a dropdown of that client's `lead_statuses`.
- "+ ליד חדש" adds a row manually, landing in the `is_default` status.
- Per-row delete (✕).

**"⚙ ניהול" panel** (statuses & columns management), reachable from the
table header:
- Statuses: add/rename/delete/reorder `open` statuses; rename (only) the
  `won`/`lost` rows; delete is disabled for those two with an explanatory
  tooltip.
- Columns: add/rename/delete/reorder custom text/number columns.

This panel is available identically on both the internal and portal views —
either side can reconfigure the client's CRM.

## Testing

- Unit tests (Vitest) for the pure status/column business rules: seeding a
  new client's default statuses, resolving a status's `kind` for the
  closed_at/deal_value auto-set logic, and the custom-column value
  read/write helpers.
- Manual verification (no live DB in this sandbox during implementation, per
  the prior sub-project's experience — verified via typecheck/tests plus a
  careful read, with a note to manually click through once a real Supabase
  instance is available): login flow (wrong password rejected, correct
  password sets a working session, session persists across a reload,
  logout/expired session redirects to login); admin password regeneration;
  inline cell editing on both the internal and portal views; adding/removing
  a custom status and column and confirming the table reflects it
  immediately; confirming dashboard revenue and monthly CPL recalculation
  still produce the same numbers as before against the reseeded demo data.
