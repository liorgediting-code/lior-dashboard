# Settings Page + JSON-to-Form Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead per-client Meta OAuth flow with a single system-level Meta token configured on a new `/settings` page, and replace the two raw-JSON textareas (`drive_links`, WhatsApp `steps`) with structured row-builder UIs that serialize to JSON invisibly.

**Architecture:** One new singleton Supabase table (`app_settings`) backs the settings page. Two new pure TypeScript modules (`lib/forms/drive-links.ts`, `lib/forms/steps.ts`) hold the row↔JSON conversion logic and get unit tests; two new "use client" components use them and write into a hidden `<input>` so the existing server actions don't change. The unused per-client OAuth code path is deleted rather than left dormant.

**Tech Stack:** Next.js 14 App Router (server actions, server components), React 18 client components (no new dependencies — reordering uses the native HTML5 drag-and-drop API), Supabase (Postgres), Vitest.

## Global Constraints

- No new npm dependencies. Existing UI classes only (`card`, `btn`, `btn-primary`, `btn-secondary`, `input`, `label`, `badge*` from `apps/web/app/globals.css`).
- All new Hebrew-facing copy must be in Hebrew, matching the rest of the app's tone.
- `supabaseAdmin()` (service role, no RLS) is the only DB access pattern in this app — do not introduce per-user auth here.
- Pure conversion logic gets Vitest unit tests (matching the existing `lib/analyzer/__tests__` pattern); React components are verified manually (no component-testing setup exists in this repo — do not add one for this plan).
- Run `npm run typecheck` and `npm run test` (from repo root) before every commit that touches `apps/web` or `packages/shared`.

---

### Task 1: `app_settings` table + shared types

**Files:**
- Create: `supabase/migrations/20260804120000_phase8_app_settings.sql`
- Modify: `packages/shared/src/domain.ts` (append after `ClientCurrentMetrics`, end of file)
- Modify: `packages/shared/src/database.types.ts:9-31` (import), `:95` (table map)

**Interfaces:**
- Produces: `AppSettings` type — `{ id: number; meta_system_user_token: string | null; meta_business_id: string | null; updated_at: string }`, exported from `@dashboard-lior/shared`. Table name `app_settings`, singleton row with `id = 1`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260804120000_phase8_app_settings.sql`:

```sql
-- Phase 8: single-row app-wide settings. Currently just the Meta System
-- User token used to sync every client's ad account from one Meta
-- Business Manager, replacing the never-activated per-client OAuth flow.

create table app_settings (
  id smallint primary key default 1 check (id = 1),
  meta_system_user_token text,
  meta_business_id text,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1);

alter table app_settings disable row level security;
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `supabase start` (if not already running), then `supabase db reset`
Expected: migration applies with no errors; reset re-runs `seed.sql` too. Verify with:
`supabase db execute --local "select * from app_settings"` (or open the local Supabase Studio) and confirm one row exists with `id = 1` and null token.

- [ ] **Step 3: Add the `AppSettings` domain type**

Append to `packages/shared/src/domain.ts` (after the `ClientCurrentMetrics` type at the end of the file):

```ts
export type AppSettings = {
  id: number;
  meta_system_user_token: string | null;
  meta_business_id: string | null;
  updated_at: string;
};
```

- [ ] **Step 4: Register the table in `database.types.ts`**

In `packages/shared/src/database.types.ts`, add `AppSettings` to the import block (currently lines 9-31):

```ts
import type {
  Client,
  BaselineSnapshot,
  Mission,
  Campaign,
  AdSet,
  Ad,
  AdMetricDaily,
  BusinessTypeBenchmark,
  CplThresholdHistoryRow,
  KillQueueItem,
  Lead,
  WeeklyReport,
  SopGate,
  SopGateEvent,
  MagicLink,
  AlertLogRow,
  WhatsappAutomation,
  WhatsappAutomationRun,
  AiInsight,
  SopBottleneck,
  ClientCurrentMetrics,
  AppSettings,
} from "./domain";
```

Then add a line right after `ai_insights: Table<AiInsight>;` (around line 95) in the `Tables` map:

```ts
      ai_insights: Table<AiInsight>;
      app_settings: Table<AppSettings>;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` (from repo root)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260804120000_phase8_app_settings.sql packages/shared/src/domain.ts packages/shared/src/database.types.ts
git commit -m "Add app_settings table for a system-level Meta token"
```

---

### Task 2: `meta_ad_account_id` field on the client edit form

**Files:**
- Modify: `apps/web/lib/actions/clients.ts:76-90` (`UpdateClientInput`), `:128-154` (`updateClientFromForm`)
- Modify: `apps/web/app/clients/[id]/edit/page.tsx:93-102` (insert a new card before the "Drive" card)

**Interfaces:**
- Consumes: `Client.meta_ad_account_id: string | null` (already in `@dashboard-lior/shared`, already a real DB column — see `apps/web/lib/meta/sync.ts:58`).
- Produces: `updateClientFromForm` now also persists `meta_ad_account_id` from a form field named `meta_ad_account_id`.

**Why this task exists:** `meta_ad_account_id` is a real column, read by the sync cron, but today it is only ever written by the per-client OAuth callback being removed in Task 4 — there is currently no UI to set it. Without this field, deleting the OAuth flow would make the column permanently unsettable.

- [ ] **Step 1: Add the field to `UpdateClientInput` and the update action**

In `apps/web/lib/actions/clients.ts`, add to the `UpdateClientInput` interface (after `profit_ratio?: number;` on line 86):

```ts
  profit_ratio?: number;
  meta_ad_account_id?: string | null;
  drive_links?: DriveLink[];
```

In `updateClientFromForm` (the object passed to `updateClient` starting at line 139), add:

```ts
  await updateClient(clientId, {
    name: String(formData.get("name") ?? ""),
    business_type: String(formData.get("business_type") ?? "other"),
    contact_info: { phone: String(formData.get("phone") ?? "") },
    deal_price_avg: numOrNull(formData, "deal_price_avg"),
    close_rate_pct: numOrNull(formData, "close_rate_pct"),
    monthly_revenue: numOrNull(formData, "monthly_revenue"),
    deals_per_month: numOrNull(formData, "deals_per_month"),
    price_range_low: numOrNull(formData, "price_range_low"),
    price_range_high: numOrNull(formData, "price_range_high"),
    profit_ratio: numOrNull(formData, "profit_ratio") ?? 5,
    meta_ad_account_id: String(formData.get("meta_ad_account_id") ?? "").trim() || null,
    drive_links: driveLinks,
    strategy_call_recording_url: String(formData.get("strategy_call_recording_url") ?? "") || null,
    strategy_call_transcript_url: String(formData.get("strategy_call_transcript_url") ?? "") || null,
  });
```

- [ ] **Step 2: Add the field to the edit page**

In `apps/web/app/clients/[id]/edit/page.tsx`, insert a new card right before the "כפתורי Drive" card (before line 93):

```tsx
        <div className="card space-y-4">
          <h2 className="font-semibold">חיבור Meta Ads</h2>
          <p className="text-sm text-slate-500">
            הטוקן המערכתי מוגדר במסך <a href="/settings" className="underline">ההגדרות</a>. כאן קובעים רק לאיזה חשבון פרסום
            של הלקוח הזה להתחבר.
          </p>
          <div>
            <label className="label" htmlFor="meta_ad_account_id">
              Ad Account ID
            </label>
            <input
              className="input font-mono"
              id="meta_ad_account_id"
              name="meta_ad_account_id"
              placeholder="act_1234567890"
              defaultValue={c.meta_ad_account_id ?? ""}
            />
          </div>
        </div>

```

- [ ] **Step 3: Typecheck and manually verify**

Run: `npm run typecheck`
Manual: `npm run dev`, open `/clients/<id>/edit`, set an Ad Account ID, save, reload the page, confirm the value persisted.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/actions/clients.ts apps/web/app/clients/[id]/edit/page.tsx
git commit -m "Add editable Meta ad account ID field to client edit form"
```

---

### Task 3: Settings page (system Meta token)

**Files:**
- Create: `apps/web/components/token-field.tsx`
- Create: `apps/web/lib/actions/settings.ts`
- Create: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/components/nav.tsx:3-8`

**Interfaces:**
- Consumes: `AppSettings` type (Task 1), `Client` type.
- Produces: `getAppSettings(): Promise<AppSettings | null>` and `updateMetaSettingsFromForm(formData: FormData): Promise<void>` from `apps/web/lib/actions/settings.ts`, used by the settings page and (in Task 5) by `apps/web/lib/meta/sync.ts`.

- [ ] **Step 1: Write the show/hide token input component**

Create `apps/web/components/token-field.tsx`:

```tsx
"use client";

import { useState } from "react";

export function TokenField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input font-mono" type={visible ? "text" : "password"} name={name} defaultValue={defaultValue} />
      <button type="button" className="btn btn-secondary" onClick={() => setVisible((v) => !v)}>
        {visible ? "הסתר" : "הצג"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the settings server actions**

Create `apps/web/lib/actions/settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AppSettings } from "@dashboard-lior/shared";

export async function getAppSettings(): Promise<AppSettings | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  return data as AppSettings | null;
}

export async function updateMetaSettingsFromForm(formData: FormData) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert({
    id: 1,
    meta_system_user_token: String(formData.get("meta_system_user_token") ?? "").trim() || null,
    meta_business_id: String(formData.get("meta_business_id") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
```

- [ ] **Step 3: Write the settings page**

Create `apps/web/app/settings/page.tsx`:

```tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppSettings, updateMetaSettingsFromForm } from "@/lib/actions/settings";
import { TokenField } from "@/components/token-field";
import type { Client } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, { data: clients }] = await Promise.all([
    getAppSettings(),
    supabaseAdmin().from("clients").select("id, name, meta_ad_account_id").order("name"),
  ]);
  const clientRows = (clients ?? []) as Pick<Client, "id" | "name" | "meta_ad_account_id">[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <form action={updateMetaSettingsFromForm} className="card space-y-4">
        <h2 className="font-semibold">חיבור Meta Ads</h2>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="mb-2 font-medium">איך ליצור System User Token:</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              היכנס ל-
              <a href="https://business.facebook.com/settings" target="_blank" rel="noreferrer" className="underline">
                Meta Business Settings
              </a>
            </li>
            <li>Users ← System Users ← בחר משתמש מערכת קיים או צור חדש</li>
            <li>Generate New Token ← בחר את האפליקציה ← סמן הרשאות ads_management ו-ads_read</li>
            <li>העתק את הטוקן שנוצר (מוצג פעם אחת בלבד) והדבק כאן</li>
            <li>
              ודא שכל חשבון פרסום של לקוח מחובר כ-partner תחת אותו Business Manager, ושה-Ad Account ID שלו מוגדר בעריכת
              הלקוח
            </li>
          </ol>
        </div>
        <div>
          <label className="label" htmlFor="meta_system_user_token">
            System User Token
          </label>
          <TokenField name="meta_system_user_token" defaultValue={settings?.meta_system_user_token ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="meta_business_id">
            Business Manager ID (אופציונלי, לתיעוד)
          </label>
          <input className="input" id="meta_business_id" name="meta_business_id" defaultValue={settings?.meta_business_id ?? ""} />
        </div>
        <button type="submit" className="btn btn-primary">
          שמור
        </button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">חשבונות פרסום של לקוחות</h2>
        {clientRows.length === 0 && <p className="text-slate-500">אין עדיין לקוחות.</p>}
        <ul className="space-y-1 text-sm">
          {clientRows.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-slate-500">{c.meta_ad_account_id ?? "לא הוגדר"}</span>
                <Link href={`/clients/${c.id}/edit`} className="text-slate-600 underline">
                  ערוך
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `apps/web/components/nav.tsx`, add to the `links` array (after `kill-queue`):

```ts
const links = [
  { href: "/", label: "דשבורד" },
  { href: "/clients", label: "לקוחות" },
  { href: "/missions", label: "משימות" },
  { href: "/kill-queue", label: "תור הריגה" },
  { href: "/settings", label: "הגדרות" },
];
```

- [ ] **Step 5: Typecheck and manually verify**

Run: `npm run typecheck`
Manual: `npm run dev`, open `/settings`, paste a fake token, click "הצג/הסתר" to confirm the toggle works, save, reload, confirm the token persisted (masked by default) and the client list shows each client's Ad Account ID with a working "ערוך" link.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/token-field.tsx apps/web/lib/actions/settings.ts apps/web/app/settings/page.tsx apps/web/components/nav.tsx
git commit -m "Add settings page for the system-level Meta token"
```

---

### Task 4: Remove the per-client Meta OAuth flow

**Files:**
- Modify: `apps/web/lib/meta/types.ts` (remove `MetaTokenExchangeResult`, trim `MetaClient` interface)
- Modify: `apps/web/lib/meta/client.ts` (remove `getAuthorizationUrl`, `exchangeCodeForToken`)
- Modify: `apps/web/lib/meta/mock-client.ts` (remove `getAuthorizationUrl`, `exchangeCodeForToken`)
- Modify: `apps/web/lib/meta/sync.ts:54-73` (`syncClientAdMetrics` reads the token from `app_settings`, not `clients.meta_access_token`)
- Modify: `apps/web/app/clients/[id]/campaigns/page.tsx:1-6,44-58` (replace the OAuth "connect" button)
- Delete: `apps/web/app/api/meta/oauth/callback/route.ts`

**Interfaces:**
- Consumes: `getAppSettings()` (Task 3).
- Produces: `MetaClient` interface now only has `fetchDailyInsights(adAccountId, accessToken, since, until)`. `syncClientAdMetrics(clientId, lookbackDays?)` unchanged signature, but now sources `accessToken` from `app_settings.meta_system_user_token` instead of `clients.meta_access_token`.

- [ ] **Step 1: Trim the `MetaClient` interface**

Replace the full contents of `apps/web/lib/meta/types.ts`:

```ts
export interface MetaAdInsight {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  date: string; // YYYY-MM-DD
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
}

export interface MetaClient {
  /** Daily spend/leads/impressions/clicks per ad, for the daily cron sync. */
  fetchDailyInsights(adAccountId: string, accessToken: string, since: string, until: string): Promise<MetaAdInsight[]>;
}
```

- [ ] **Step 2: Remove OAuth methods from `RealMetaClient`**

In `apps/web/lib/meta/client.ts`:
- Change the import on line 2 to `import type { MetaClient, MetaAdInsight } from "./types";`
- Delete the `getAuthorizationUrl` method (lines 20-28) and the `exchangeCodeForToken` method (lines 30-50) in their entirety, keeping only the constructor and `fetchDailyInsights`.
- The constructor's `redirectUri` parameter and `appSecret` are now unused by any remaining method but are still accepted by `getMetaClient()` in `lib/meta/index.ts` — leave the constructor signature as-is so `index.ts` doesn't need to change.

- [ ] **Step 3: Remove OAuth methods from `MockMetaClient`**

In `apps/web/lib/meta/mock-client.ts`:
- Change the import on line 2 to `import type { MetaClient, MetaAdInsight } from "./types";`
- Delete the `getAuthorizationUrl` method (lines 16-18) and `exchangeCodeForToken` method (lines 20-22), keeping only `seededRandom` and `fetchDailyInsights`.

- [ ] **Step 4: Delete the OAuth callback route**

```bash
git rm apps/web/app/api/meta/oauth/callback/route.ts
```

- [ ] **Step 5: Source the sync token from `app_settings`**

In `apps/web/lib/meta/sync.ts`, replace `syncClientAdMetrics` (lines 54-73):

```ts
export async function syncClientAdMetrics(clientId: string, lookbackDays = 3) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("meta_ad_account_id").eq("id", clientId).single(),
    supabase.from("app_settings").select("meta_system_user_token").eq("id", 1).maybeSingle(),
  ]);

  const meta = getMetaClient();
  const useMock = process.env.META_USE_MOCK !== "false";
  const adAccountId = useMock ? "act_mock123" : (client?.meta_ad_account_id as string | null);
  const accessToken = useMock ? "mock" : (settings?.meta_system_user_token as string | null);

  if (!adAccountId || !accessToken) {
    return { clientId, synced: 0, skipped: "no Meta connection configured yet" };
  }
```

Leave the rest of the function (from `const since = isoDaysAgo(lookbackDays);` onward) unchanged.

- [ ] **Step 6: Replace the OAuth button on the campaigns page**

In `apps/web/app/clients/[id]/campaigns/page.tsx`:
- Add `import Link from "next/link";` to the imports, and remove `import { getMetaClient } from "@/lib/meta";` (no longer used on this page).
- Delete lines 44-45 (`const meta = getMetaClient(); const authUrl = meta.getAuthorizationUrl(c.id);`), keeping `const isConnected = Boolean(c.meta_ad_account_id);`.
- Replace the button block (current lines 53-58):

```tsx
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">30 הימים האחרונים</p>
        <div className="flex items-center gap-2">
          <span className={isConnected ? "badge badge-winner" : "badge badge-insufficient"}>
            {isConnected ? `מחובר: ${c.meta_ad_account_id}` : "לא הוגדר חשבון פרסום"}
          </span>
          <Link href={`/clients/${c.id}/edit`} className="btn btn-secondary">
            ערוך חשבון פרסום
          </Link>
          <Link href="/settings" className="btn btn-secondary">
            הגדרות Meta
          </Link>
        </div>
      </div>
```

- [ ] **Step 7: Typecheck and manually verify**

Run: `npm run typecheck`
Manual: `npm run dev`, open `/clients/<id>/campaigns`, confirm the badge/links render instead of the old "התחבר ל-Meta Ads" button, and clicking through reaches the edit page and settings page. With `META_USE_MOCK` unset (default true), trigger a sync (`POST /api/cron/daily-ad-sync` with the configured cron secret, or call `syncAllClients()` directly) and confirm it still succeeds using the mock account/token path.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/meta/types.ts apps/web/lib/meta/client.ts apps/web/lib/meta/mock-client.ts apps/web/lib/meta/sync.ts apps/web/app/clients/[id]/campaigns/page.tsx
git commit -m "Replace per-client Meta OAuth with the system-level token from app_settings"
```

---

### Task 5: `drive_links` pure conversion helpers

**Files:**
- Create: `apps/web/lib/forms/drive-links.ts`
- Test: `apps/web/lib/forms/__tests__/drive-links.test.ts`

**Interfaces:**
- Produces: `serializeDriveLinks(rows: DriveLink[]): string`, used by `DriveLinksEditor` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/forms/__tests__/drive-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { serializeDriveLinks } from "../drive-links";

describe("serializeDriveLinks", () => {
  it("serializes non-empty rows to JSON", () => {
    const json = serializeDriveLinks([{ label: "תיקייה", url: "https://drive.google.com/x" }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://drive.google.com/x" }]);
  });

  it("trims whitespace from label and url", () => {
    const json = serializeDriveLinks([{ label: "  תיקייה  ", url: "  https://x  " }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://x" }]);
  });

  it("drops rows where both fields are empty", () => {
    const json = serializeDriveLinks([
      { label: "", url: "" },
      { label: "תיקייה", url: "https://x" },
    ]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://x" }]);
  });

  it("keeps a row with only one field filled in", () => {
    const json = serializeDriveLinks([{ label: "תיקייה", url: "" }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "" }]);
  });

  it("serializes an empty list to an empty JSON array", () => {
    expect(serializeDriveLinks([])).toBe("[]");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- drive-links`
Expected: FAIL — `../drive-links` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/forms/drive-links.ts`:

```ts
import type { DriveLink } from "@dashboard-lior/shared";

/** Drops rows where both fields are empty, and trims whitespace. */
export function serializeDriveLinks(rows: DriveLink[]): string {
  const cleaned = rows
    .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter((row) => row.label !== "" || row.url !== "");
  return JSON.stringify(cleaned);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- drive-links`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/forms/drive-links.ts apps/web/lib/forms/__tests__/drive-links.test.ts
git commit -m "Add pure drive_links row-to-JSON conversion helper"
```

---

### Task 6: `DriveLinksEditor` component, wired into the client edit form

**Files:**
- Create: `apps/web/components/drive-links-editor.tsx`
- Modify: `apps/web/app/clients/[id]/edit/page.tsx:93-102` (the "כפתורי Drive" card)

**Interfaces:**
- Consumes: `serializeDriveLinks` (Task 5), `DriveLink` type.
- Produces: `<DriveLinksEditor name="drive_links" defaultValue={DriveLink[]} />` — renders a hidden `<input name="drive_links">` whose value is always the serialized JSON, so `updateClientFromForm` (unchanged) keeps working.

- [ ] **Step 1: Write the component**

Create `apps/web/components/drive-links-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { DriveLink } from "@dashboard-lior/shared";
import { serializeDriveLinks } from "@/lib/forms/drive-links";

type Row = DriveLink & { key: number };

let nextKey = 0;

function toRows(links: DriveLink[]): Row[] {
  return links.length > 0 ? links.map((link) => ({ ...link, key: nextKey++ })) : [{ label: "", url: "", key: nextKey++ }];
}

export function DriveLinksEditor({ name, defaultValue }: { name: string; defaultValue: DriveLink[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultValue));

  function updateRow(key: number, field: "label" | "url", value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { label: "", url: "", key: nextKey++ }]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2">
          <input
            className="input"
            placeholder="תווית (למשל: תיקיית קריאייטיב)"
            value={row.label}
            onChange={(e) => updateRow(row.key, "label", e.target.value)}
          />
          <input
            className="input"
            placeholder="קישור"
            value={row.url}
            onChange={(e) => updateRow(row.key, "url", e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => removeRow(row.key)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addRow}>
        + הוסף קישור
      </button>
      <input type="hidden" name={name} value={serializeDriveLinks(rows)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the edit page**

In `apps/web/app/clients/[id]/edit/page.tsx`:
- Add `import { DriveLinksEditor } from "@/components/drive-links-editor";` to the imports.
- Replace the "כפתורי Drive" card (lines 93-102):

```tsx
        <div className="card space-y-4">
          <h2 className="font-semibold">כפתורי Drive</h2>
          <DriveLinksEditor name="drive_links" defaultValue={c.drive_links ?? []} />
        </div>
```

- [ ] **Step 3: Typecheck and manually verify**

Run: `npm run typecheck`
Manual: `npm run dev`, open `/clients/<id>/edit`, add two Drive links, remove one, save, reload, confirm the remaining link is still there and clicking "+ הוסף קישור" / "✕" works with no JSON visible anywhere.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/drive-links-editor.tsx apps/web/app/clients/[id]/edit/page.tsx
git commit -m "Replace drive_links JSON textarea with a row editor"
```

---

### Task 7: WhatsApp `steps` pure conversion helpers

**Files:**
- Create: `apps/web/lib/forms/steps.ts`
- Test: `apps/web/lib/forms/__tests__/steps.test.ts`

**Interfaces:**
- Produces: `StepUnit` (`"minutes" | "hours" | "days"`), `StepRow` (`{type: "message"; text: string} | {type: "wait"; amount: number; unit: StepUnit}`), `stepToRow(step: WhatsappAutomationStep): StepRow`, `serializeSteps(rows: StepRow[]): string` — used by `StepsEditor` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/forms/__tests__/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToStep, serializeSteps, stepToRow } from "../steps";

describe("rowToStep", () => {
  it("converts a message row as-is", () => {
    expect(rowToStep({ type: "message", text: "היי!" })).toEqual({ type: "message", text: "היי!" });
  });

  it("converts a wait row in minutes", () => {
    expect(rowToStep({ type: "wait", amount: 30, unit: "minutes" })).toEqual({ type: "wait", wait_minutes: 30 });
  });

  it("converts a wait row in hours to minutes", () => {
    expect(rowToStep({ type: "wait", amount: 2, unit: "hours" })).toEqual({ type: "wait", wait_minutes: 120 });
  });

  it("converts a wait row in days to minutes", () => {
    expect(rowToStep({ type: "wait", amount: 1, unit: "days" })).toEqual({ type: "wait", wait_minutes: 1440 });
  });
});

describe("stepToRow", () => {
  it("picks days when the minute count divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 1440 })).toEqual({ type: "wait", amount: 1, unit: "days" });
  });

  it("picks hours when only that divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 120 })).toEqual({ type: "wait", amount: 2, unit: "hours" });
  });

  it("falls back to minutes when nothing bigger divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 90 })).toEqual({ type: "wait", amount: 90, unit: "minutes" });
  });

  it("round-trips a message step", () => {
    expect(stepToRow({ type: "message", text: "רק בודקים" })).toEqual({ type: "message", text: "רק בודקים" });
  });
});

describe("serializeSteps", () => {
  it("serializes mixed rows to the WhatsappAutomationStep JSON shape", () => {
    const json = serializeSteps([
      { type: "message", text: "היי!" },
      { type: "wait", amount: 1, unit: "days" },
    ]);
    expect(JSON.parse(json)).toEqual([
      { type: "message", text: "היי!" },
      { type: "wait", wait_minutes: 1440 },
    ]);
  });

  it("drops message rows with blank text", () => {
    const json = serializeSteps([{ type: "message", text: "   " }]);
    expect(JSON.parse(json)).toEqual([]);
  });

  it("keeps wait rows even when amount is 0", () => {
    const json = serializeSteps([{ type: "wait", amount: 0, unit: "minutes" }]);
    expect(JSON.parse(json)).toEqual([{ type: "wait", wait_minutes: 0 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- steps`
Expected: FAIL — `../steps` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/forms/steps.ts`:

```ts
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";

export type StepUnit = "minutes" | "hours" | "days";

export type MessageStepRow = { type: "message"; text: string };
export type WaitStepRow = { type: "wait"; amount: number; unit: StepUnit };
export type StepRow = MessageStepRow | WaitStepRow;

const UNIT_TO_MINUTES: Record<StepUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/** Picks the largest unit that divides wait_minutes evenly, defaulting to minutes. */
function minutesToUnit(minutes: number): { amount: number; unit: StepUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

export function stepToRow(step: WhatsappAutomationStep): StepRow {
  if (step.type === "wait") {
    return { type: "wait", ...minutesToUnit(step.wait_minutes ?? 0) };
  }
  return { type: "message", text: step.text ?? "" };
}

export function rowToStep(row: StepRow): WhatsappAutomationStep {
  if (row.type === "wait") {
    return { type: "wait", wait_minutes: Math.max(0, Math.round(row.amount * UNIT_TO_MINUTES[row.unit])) };
  }
  return { type: "message", text: row.text };
}

/** Drops message rows with blank text before serializing. */
export function serializeSteps(rows: StepRow[]): string {
  const cleaned = rows.filter((row) => row.type === "wait" || row.text.trim() !== "");
  return JSON.stringify(cleaned.map(rowToStep));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- steps`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/forms/steps.ts apps/web/lib/forms/__tests__/steps.test.ts
git commit -m "Add pure WhatsApp steps row-to-JSON conversion helpers"
```

---

### Task 8: `StepsEditor` component, wired into the WhatsApp automation form

**Files:**
- Create: `apps/web/components/steps-editor.tsx`
- Modify: `apps/web/app/clients/[id]/whatsapp/page.tsx` (remove `EXAMPLE_STEPS`, replace the `steps` textarea)

**Interfaces:**
- Consumes: `stepToRow`, `serializeSteps`, `StepRow`, `StepUnit` (Task 7), `WhatsappAutomationStep` type.
- Produces: `<StepsEditor name="steps" defaultValue={WhatsappAutomationStep[]} />` — renders a hidden `<input name="steps">` whose value is always the serialized JSON, so `createAutomationAction` (unchanged) keeps working. Reordering uses the native HTML5 drag-and-drop API (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) — no new dependency.

- [ ] **Step 1: Write the component**

Create `apps/web/components/steps-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { WhatsappAutomationStep } from "@dashboard-lior/shared";
import { serializeSteps, stepToRow, type StepRow, type StepUnit } from "@/lib/forms/steps";

type Row = StepRow & { key: number };

let nextKey = 0;

function toRows(steps: WhatsappAutomationStep[]): Row[] {
  const base: StepRow[] = steps.length > 0 ? steps.map(stepToRow) : [{ type: "message", text: "" }];
  return base.map((row) => ({ ...row, key: nextKey++ }));
}

export function StepsEditor({ name, defaultValue }: { name: string; defaultValue: WhatsappAutomationStep[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultValue));
  const [dragKey, setDragKey] = useState<number | null>(null);

  function addRow() {
    setRows((prev) => [...prev, { type: "message", text: "", key: nextKey++ }]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function setType(key: number, type: StepRow["type"]) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key ? (type === "wait" ? { key, type, amount: 30, unit: "minutes" } : { key, type, text: "" }) : row
      )
    );
  }

  function setText(key: number, text: string) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "message" ? { ...row, text } : row)));
  }

  function setAmount(key: number, amount: number) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "wait" ? { ...row, amount } : row)));
  }

  function setUnit(key: number, unit: StepUnit) {
    setRows((prev) => prev.map((row) => (row.key === key && row.type === "wait" ? { ...row, unit } : row)));
  }

  function reorder(targetKey: number) {
    if (dragKey === null || dragKey === targetKey) return;
    setRows((prev) => {
      const fromIndex = prev.findIndex((row) => row.key === dragKey);
      const toIndex = prev.findIndex((row) => row.key === targetKey);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragKey(null);
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.key}
          draggable
          onDragStart={() => setDragKey(row.key)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => reorder(row.key)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"
        >
          <span className="cursor-move text-slate-400" title="גרור לשינוי סדר">
            ⠿
          </span>
          <select className="input w-32" value={row.type} onChange={(e) => setType(row.key, e.target.value as StepRow["type"])}>
            <option value="message">הודעה</option>
            <option value="wait">המתנה</option>
          </select>
          {row.type === "message" ? (
            <textarea
              className="input flex-1"
              rows={2}
              placeholder="טקסט ההודעה"
              value={row.text}
              onChange={(e) => setText(row.key, e.target.value)}
            />
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <input
                className="input w-24"
                type="number"
                min={0}
                value={row.amount}
                onChange={(e) => setAmount(row.key, Number(e.target.value))}
              />
              <select className="input w-28" value={row.unit} onChange={(e) => setUnit(row.key, e.target.value as StepUnit)}>
                <option value="minutes">דקות</option>
                <option value="hours">שעות</option>
                <option value="days">ימים</option>
              </select>
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => removeRow(row.key)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addRow}>
        + הוסף שלב
      </button>
      <input type="hidden" name={name} value={serializeSteps(rows)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the WhatsApp page**

In `apps/web/app/clients/[id]/whatsapp/page.tsx`:
- Remove the `EXAMPLE_STEPS` constant (lines 9-17) entirely.
- Add `import { StepsEditor } from "@/components/steps-editor";` to the imports.
- Replace the `steps` field block (lines 77-82):

```tsx
        <div>
          <label className="label">שלבים</label>
          <StepsEditor name="steps" defaultValue={[]} />
        </div>
```

- [ ] **Step 3: Typecheck and manually verify**

Run: `npm run typecheck`
Manual: `npm run dev`, open `/clients/<id>/whatsapp`, build an automation with a message step and a wait step (e.g. 1 day), drag to reorder them, remove a step, then submit and confirm the saved automation's rendered step list (the read-only list above the form) shows the correct message/wait text — this proves the hidden JSON round-tripped through `createAutomationAction` correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/steps-editor.tsx apps/web/app/clients/[id]/whatsapp/page.tsx
git commit -m "Replace WhatsApp steps JSON textarea with a row editor"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (settings page, system token, help text, client Ad Account ID list, nav link, OAuth removal) → Tasks 1-4. Part 2 (drive_links editor, steps editor with add/remove/reorder) → Tasks 5-8.
- **Correction from spec:** the spec assumed `meta_ad_account_id` already had an edit-form field ("already exists in the form"); investigation during planning (Task 2) found that assumption was wrong — no such field exists yet, it was only ever written by the OAuth callback being deleted. Task 2 was added to cover this; without it, Task 4 would remove the only way to set that column.
- **Type consistency:** `StepRow`/`StepUnit`/`stepToRow`/`serializeSteps` (Task 7) match exactly what `StepsEditor` (Task 8) imports. `serializeDriveLinks` (Task 5) matches what `DriveLinksEditor` (Task 6) imports. `AppSettings` (Task 1) matches what `settings.ts` (Task 3) and `sync.ts` (Task 4) use.
