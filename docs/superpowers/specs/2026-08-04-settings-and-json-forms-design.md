# Settings Page + JSON-to-Form Conversion — Design

## Context

This is sub-project 1 of a larger roadmap (see "Roadmap" below). It bundles two small, independent, low-risk changes the user asked to knock out first:

1. A new `/settings` page to configure a single system-level Meta access token, replacing the unused per-client OAuth flow.
2. Replacing the two raw-JSON textareas in the app (`drive_links` on client edit, `steps` on WhatsApp automation creation) with structured row-builder UIs that serialize to JSON invisibly.

### Roadmap (for context, not in scope here)

1. **Settings + JSON forms** (this spec)
2. Client-facing CRM portal (password-per-client login, webhook/automation lead intake, custom statuses/columns, Monday-style table) — will also absorb the **weekly campaign questionnaire** feature (client fills a template-based weekly questionnaire via the portal; template editable globally and per-client; answers viewable in the dashboard and analyzable by AI; also exposed as a new MCP tool in `apps/mcp-server`)
3. Goals page (personal goals + amount paid per client + auto-calculated goals from dashboard data)
4. Personal/agency CRM (separate from client CRM)
5. Funnels page for the agency's own business (campaign ↔ funnel, notes, drive/materials links)
6. Notes feed (dated, per client/funnel, shown in a left-side panel)
7. "Business tasks" — personal task list under the missions page, separate from per-client missions

---

## Part 1: Settings page & system Meta token

### Problem

Meta integration today (`apps/web/app/api/meta/oauth/callback/route.ts`) is built for **per-client OAuth**: each client would authorize their own ad account, storing `meta_access_token`/`meta_ad_account_id` on their `clients` row. No UI ever triggers this flow, and no real `META_APP_ID`/`META_APP_SECRET` exist — it's inert code.

The user's actual workflow is the standard agency model: all client ad accounts are added as partners under the user's own Meta Business Manager. A single **System User Token**, generated manually in Meta Business Settings, can read every client's ad account. There's no OAuth step at all.

### Changes

- **New table** `app_settings` (migration `supabase/migrations/<ts>_phase8_app_settings.sql`), single-row table (`id` fixed/singleton, enforced by a check or just always upserting id=1):
  - `meta_system_user_token text`
  - `meta_business_id text` (optional, informational)
  - `updated_at timestamptz`
- **New page** `apps/web/app/settings/page.tsx`:
  - Form field to paste/update the token (masked input, show/hide toggle).
  - Static help card with numbered steps to generate a System User Token in Meta Business Settings, plus a direct link to `business.facebook.com/settings`.
  - Read-only list of clients with their `meta_ad_account_id`, each linking to that client's edit page (where the field already exists) — no duplicate editing UI here.
- **New server action** `apps/web/lib/actions/settings.ts`: `getAppSettings()`, `updateMetaToken(formData)`.
- **Remove** `apps/web/app/api/meta/oauth/callback/route.ts` (dead code, wrong model).
- **Update** `apps/web/lib/meta` client construction and the daily-ad-sync cron (`apps/web/app/api/cron/daily-ad-sync/route.ts`) to source the token from `app_settings` instead of `client.meta_access_token`. Per-client `meta_ad_account_id` is still used to pick which account to pull.
- **Nav**: add "הגדרות" link to `apps/web/components/nav.tsx`.
- `clients.meta_access_token` column stays in the schema for now (unused going forward) — not part of this change to drop it; removing dead columns is a separate cleanup, not requested.

### Out of scope

- Encrypting/vaulting the token (existing code already stores tokens in plain text; matching that precedent, not worsening it — flagged as a pre-existing TODO, not fixed here).
- Any other settings beyond the Meta token.

---

## Part 2: JSON textareas → row builders

### Problem

Two forms require typing raw JSON by hand:

- `apps/web/app/clients/[id]/edit/page.tsx` → `drive_links`: `{label, url}[]`.
- `apps/web/app/clients/[id]/whatsapp/page.tsx` → `steps`: `({type: "message", text} | {type: "wait", wait_minutes: number})[]`.

### Design

Both become small client components that manage rows in React state and write the serialized JSON into a hidden `<input>` with the same `name` the server action already reads — **no server action changes needed** in either case.

**`DriveLinksEditor`** (`apps/web/components/drive-links-editor.tsx`):
- Row = תווית (label) + קישור (url) text inputs.
- "+ הוסף קישור" button appends a row; "✕" removes a row.
- Initializes from the client's existing `drive_links` (parsed once on mount from the value already in the DB — not user-typed JSON).
- On every change, serializes non-empty rows to JSON into `<input type="hidden" name="drive_links">`.

**`StepsEditor`** (`apps/web/components/steps-editor.tsx`):
- Row = type selector (הודעה / המתנה).
  - "הודעה" → textarea for `text`.
  - "המתנה" → number input + unit selector (דקות/שעות/ימים), converted to `wait_minutes` on serialize (hours × 60, days × 1440).
- Drag handle to reorder, "✕" to delete, "+ הוסף שלב" to append. Editing/reordering is scoped to the in-progress creation form only — no support for editing already-saved automations (would require new `updateAutomation`/`deleteAutomation` server actions, not requested).
- Serializes to `<input type="hidden" name="steps">` on every change, matching the exact shape `createAutomationAction` already parses.

Both share a small internal pattern (rows in state + hidden JSON input) but are separate components since the row shape and per-type fields differ.

### Testing

- Manual: create/edit a client with 0, 1, and multiple drive links; verify saved `drive_links` in DB matches old JSON format.
- Manual: build a multi-step WhatsApp automation (message + wait, reordered), verify saved `steps` matches shape `whatsapp` automation runner expects (`apps/web/lib/actions/whatsapp.ts` / automation-tick cron).
- Manual: Settings page — paste a token, reload, confirm it persists; confirm daily-ad-sync cron reads it (can check via `get_logs`/manual invocation in mock mode).
