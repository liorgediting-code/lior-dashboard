# Client CRM Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 5-stage lead kanban with a per-client customizable Monday-style table (custom statuses, custom text/number columns), shared identically between the agency's internal dashboard and a new password-protected client portal.

**Architecture:** Two new tables (`lead_statuses`, `lead_columns`) replace the `leads.stage` enum with a per-client status list that always keeps exactly one undeletable `won` and one undeletable `lost` row (everything else is a freely managed `open` row), so revenue/close-rate math keeps working by filtering on `kind` instead of a literal string. Password auth is built from Node's built-in `crypto` module (scrypt for hashing, HMAC for signed session cookies) — no new npm dependencies. One shared `CrmTable` + `CrmManagePanel` React component pair renders on both `/clients/[id]/crm` (internal, no login, like every other internal route) and `/client/[clientId]/crm` (portal, behind the new login).

**Tech Stack:** Next.js 14 App Router (server actions, server components, client components), Supabase (Postgres), Vitest, Node's built-in `crypto` module.

## Global Constraints

- No new npm dependencies — password hashing and session signing use Node's built-in `crypto` module only.
- This is a pre-launch app with no real production data — `supabase/seed.sql` is rewritten for the new schema rather than backfilled; there is no need for a backward-compatible data migration.
- All new Hebrew-facing copy must be in Hebrew, matching the rest of the app's tone.
- Existing UI classes only (`card`, `btn`, `btn-primary`, `btn-secondary`, `input`, `label`, `badge*`) from `apps/web/app/globals.css` — no new CSS.
- `supabaseAdmin()` (service role, no RLS) is the DB access pattern everywhere **except** the new client-portal auth boundary — `/client/[clientId]/*` is this app's first real external-facing auth check, and it must verify the session cookie's `clientId` matches the requested route's `clientId`, not just that a valid cookie exists.
- Pure business logic (password hashing, session signing, status-change/deletion rules) gets Vitest unit tests, following the existing `lib/*/__tests__/*.test.ts` convention. UI components and DB-backed server actions are verified by careful diff review plus `npm run typecheck`/`npm run test` — there is no local Supabase/Docker instance available during implementation (same constraint as the prior sub-project), so live manual click-through isn't possible; note this in each task's verification instead of skipping verification.
- Run `npm run typecheck` and `npm run test` (from repo root) before every commit.
- Every DB-mutating action that touches a client's leads/statuses/columns must `revalidatePath` **both** `/clients/[id]/crm` and `/client/[clientId]/crm`, since either surface may be viewing the same data (the two views are unified, not independent).

---

### Task 1: Schema migration + shared types

**Files:**
- Create: `supabase/migrations/20260804130000_phase9_lead_statuses_columns.sql`
- Modify: `packages/shared/src/domain.ts` (remove `LeadStage`; modify `Lead`; add `LeadStatusKind`, `LeadStatus`, `LeadColumnType`, `LeadColumn`)
- Modify: `packages/shared/src/database.types.ts` (register `lead_statuses`, `lead_columns`)

**Interfaces:**
- Produces: `LeadStatus = { id: string; client_id: string; label: string; kind: "open" | "won" | "lost"; sort_order: number; is_default: boolean }`, `LeadColumn = { id: string; client_id: string; name: string; type: "text" | "number"; sort_order: number }`, and the updated `Lead = { id: string; client_id: string; name: string | null; phone: string | null; email: string | null; source_ad_id: string | null; status_id: string; custom_fields: Record<string, string | number>; created_at: string; closed_at: string | null; deal_value: number | null }` — all exported from `@dashboard-lior/shared`, consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260804130000_phase9_lead_statuses_columns.sql`:

```sql
-- Phase 9: per-client customizable lead statuses & columns, replacing the
-- fixed 5-stage kanban. Every client keeps exactly one 'won' and one
-- 'lost' status (app-enforced undeletable, renameable) so revenue/close-
-- rate math survives clients defining their own additional 'open' statuses.

create table lead_statuses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('open', 'won', 'lost')),
  sort_order int not null default 0,
  is_default boolean not null default false
);

create index lead_statuses_client_idx on lead_statuses (client_id, sort_order);

create table lead_columns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'number')),
  sort_order int not null default 0
);

create index lead_columns_client_idx on lead_columns (client_id, sort_order);

alter table leads
  add column email text,
  add column status_id uuid references lead_statuses(id),
  add column custom_fields jsonb not null default '{}',
  drop column stage;

alter table leads alter column status_id set not null;

create index leads_client_status_idx on leads (client_id, status_id);

-- close_rate/closes now resolve through lead_statuses.kind instead of a
-- literal stage string, so custom status labels don't break this function.
create or replace function fn_client_current_metrics(
  p_client_id uuid,
  p_since date default current_date - 30,
  p_until date default current_date
)
returns table (
  spend numeric,
  leads_count int,
  closes int,
  avg_cost_per_lead numeric,
  close_rate_pct numeric,
  cost_per_deal numeric
)
language sql
stable
as $$
  with m as (
    select sum(amd.spend) as spend, sum(amd.leads) as leads_count
    from ad_metrics_daily amd
    join ads a on a.id = amd.ad_id
    join adsets ase on ase.id = a.adset_id
    join campaigns c on c.id = ase.campaign_id
    where c.client_id = p_client_id
      and amd.date between p_since and p_until
  ),
  l as (
    select
      count(*) filter (where ls.kind = 'won') as closes,
      count(*) as total
    from leads le
    join lead_statuses ls on ls.id = le.status_id
    where le.client_id = p_client_id
      and le.created_at between p_since and p_until
  ),
  r as (
    select (l.closes::numeric / nullif(l.total, 0)) as close_rate_fraction
    from l
  )
  select
    m.spend,
    m.leads_count,
    l.closes,
    m.spend / nullif(m.leads_count, 0) as avg_cost_per_lead,
    r.close_rate_fraction * 100 as close_rate_pct,
    (m.spend / nullif(m.leads_count, 0)) / nullif(r.close_rate_fraction, 0) as cost_per_deal
  from m, l, r;
$$;

alter table lead_statuses disable row level security;
alter table lead_columns disable row level security;
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `supabase start` (if not already running), then `supabase db reset`
Expected: migration applies with no errors. If Docker/local Supabase is unavailable in this environment, skip this step and instead sanity-check the SQL by eye against `supabase/migrations/20260803120200_phase3_leads_crm_reports.sql` (the original `fn_client_current_metrics` this replaces) — note in your report whichever path you took.

- [ ] **Step 3: Update the shared domain types**

In `packages/shared/src/domain.ts`:
- Remove the line `export type LeadStage = "new" | "contacted" | "qualified" | "won" | "lost";`
- Replace the `Lead` type with:

```ts
export type Lead = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source_ad_id: string | null;
  status_id: string;
  custom_fields: Record<string, string | number>;
  created_at: string;
  closed_at: string | null;
  deal_value: number | null;
};
```

- Add, right after the `Lead` type:

```ts
export type LeadStatusKind = "open" | "won" | "lost";

export type LeadStatus = {
  id: string;
  client_id: string;
  label: string;
  kind: LeadStatusKind;
  sort_order: number;
  is_default: boolean;
};

export type LeadColumnType = "text" | "number";

export type LeadColumn = {
  id: string;
  client_id: string;
  name: string;
  type: LeadColumnType;
  sort_order: number;
};
```

- [ ] **Step 4: Register the new tables in `database.types.ts`**

In `packages/shared/src/database.types.ts`, add `LeadStatus` and `LeadColumn` to the import list from `./domain`, then add to the `Tables` map (near `leads`, using the existing `ClientFk` helper already defined in this file):

```ts
      lead_statuses: Table<LeadStatus, ClientFk<"lead_statuses">>;
      lead_columns: Table<LeadColumn, ClientFk<"lead_columns">>;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: fails until later tasks update every `Lead`/`stage` consumer — that's expected at this point in the plan. Confirm the *specific* errors are all in files this plan will touch later (`apps/web/lib/actions/leads.ts`, `apps/web/app/clients/[id]/crm/page.tsx`, `apps/web/components/lead-card.tsx`, `apps/web/lib/analyzer/monthly-recalc.ts`, `apps/web/app/page.tsx`, `apps/web/app/client/[clientId]/crm/page.tsx`) and report the list — do not fix them in this task.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260804130000_phase9_lead_statuses_columns.sql packages/shared/src/domain.ts packages/shared/src/database.types.ts
git commit -m "Replace fixed lead stage enum with per-client lead_statuses/lead_columns"
```

---

### Task 2: Rewrite demo seed data for the new schema

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: `lead_statuses`, `lead_columns` tables and `leads.status_id`/`leads.email` columns from Task 1.

- [ ] **Step 1: Add default status seeding for all 3 demo clients, and update the leads insert**

Replace the existing `insert into leads (...)` block (currently referencing `stage`) and add status seeding for each of the 3 clients. Insert this block immediately after each client's `insert into clients (...)` statement (so the file reads client → baseline → statuses, in order for each client), using these fixed status IDs:

For client 1 (`11111111-1111-1111-1111-111111111111`), insert right after its `baseline_snapshots` insert:

```sql
insert into lead_statuses (id, client_id, label, kind, sort_order, is_default) values
  ('11111111-5555-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'חדש', 'open', 0, true),
  ('11111111-5555-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'בקשר', 'open', 1, false),
  ('11111111-5555-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', 'מוסמך', 'open', 2, false),
  ('11111111-5555-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', 'נסגר', 'won', 3, false),
  ('11111111-5555-1111-1111-111111111105', '11111111-1111-1111-1111-111111111111', 'אבד', 'lost', 4, false);
```

Then replace the old `insert into leads (client_id, name, phone, source_ad_id, stage, created_at, closed_at, deal_value) values (...)` block with:

```sql
insert into leads (client_id, name, phone, email, source_ad_id, status_id, created_at, closed_at, deal_value) values
  ('11111111-1111-1111-1111-111111111111', 'דנה כהן', '052-1112222', 'dana.cohen@example.com', '11111111-4444-1111-1111-111111111111', '11111111-5555-1111-1111-111111111104', now() - interval '10 days', now() - interval '3 days', 3200),
  ('11111111-1111-1111-1111-111111111111', 'יוסי לוי', '052-3334444', 'yossi.levi@example.com', '11111111-4444-1111-1111-111111111111', '11111111-5555-1111-1111-111111111103', now() - interval '2 days', null, null),
  ('11111111-1111-1111-1111-111111111111', 'מיכל אזולאי', '052-5556666', null, '11111111-4444-1111-1111-111111111112', '11111111-5555-1111-1111-111111111105', now() - interval '15 days', now() - interval '12 days', null);
```

For client 2 (`22222222-1111-1111-1111-111111111111`), insert right after its `baseline_snapshots` insert:

```sql
insert into lead_statuses (id, client_id, label, kind, sort_order, is_default) values
  ('22222222-5555-1111-1111-111111111101', '22222222-1111-1111-1111-111111111111', 'חדש', 'open', 0, true),
  ('22222222-5555-1111-1111-111111111102', '22222222-1111-1111-1111-111111111111', 'בקשר', 'open', 1, false),
  ('22222222-5555-1111-1111-111111111103', '22222222-1111-1111-1111-111111111111', 'מוסמך', 'open', 2, false),
  ('22222222-5555-1111-1111-111111111104', '22222222-1111-1111-1111-111111111111', 'נסגר', 'won', 3, false),
  ('22222222-5555-1111-1111-111111111105', '22222222-1111-1111-1111-111111111111', 'אבד', 'lost', 4, false);
```

For client 3 (`33333333-1111-1111-1111-111111111111`), insert right after its `baseline_snapshots` insert:

```sql
insert into lead_statuses (id, client_id, label, kind, sort_order, is_default) values
  ('33333333-5555-1111-1111-111111111101', '33333333-1111-1111-1111-111111111111', 'חדש', 'open', 0, true),
  ('33333333-5555-1111-1111-111111111102', '33333333-1111-1111-1111-111111111111', 'בקשר', 'open', 1, false),
  ('33333333-5555-1111-1111-111111111103', '33333333-1111-1111-1111-111111111111', 'מוסמך', 'open', 2, false),
  ('33333333-5555-1111-1111-111111111104', '33333333-1111-1111-1111-111111111111', 'נסגר', 'won', 3, false),
  ('33333333-5555-1111-1111-111111111105', '33333333-1111-1111-1111-111111111111', 'אבד', 'lost', 4, false);
```

- [ ] **Step 2: Apply and verify**

Run: `supabase db reset` if a local Supabase instance is available; otherwise, re-read the full edited file once to confirm every `client_id`/`status_id` UUID referenced in the `leads` insert matches a UUID actually defined in the corresponding `lead_statuses` insert above it, and note in your report which verification path you used.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "Rewrite demo seed data for lead_statuses/lead_columns schema"
```

---

### Task 3: Seed default lead statuses when a client is created

**Files:**
- Modify: `apps/web/lib/actions/clients.ts:31-74` (`createClient`)

**Interfaces:**
- Consumes: `lead_statuses` table (Task 1).
- Produces: every newly created client automatically gets the same 5-row default status set used in the seed data, so the CRM is immediately usable without manual setup.

- [ ] **Step 1: Add status seeding to `createClient`**

In `apps/web/lib/actions/clients.ts`, right after the existing `await supabase.from("sop_gate_events").insert({...})` call inside `createClient` (before the `dispatchWebhook` call), add:

```ts
  await supabase.from("lead_statuses").insert([
    { client_id: client.id as string, label: "חדש", kind: "open", sort_order: 0, is_default: true },
    { client_id: client.id as string, label: "בקשר", kind: "open", sort_order: 1, is_default: false },
    { client_id: client.id as string, label: "מוסמך", kind: "open", sort_order: 2, is_default: false },
    { client_id: client.id as string, label: "נסגר", kind: "won", sort_order: 3, is_default: false },
    { client_id: client.id as string, label: "אבד", kind: "lost", sort_order: 4, is_default: false },
  ]);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: this file's portion is clean (remaining repo-wide errors from Task 1 are still expected until later tasks land).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions/clients.ts
git commit -m "Seed default lead statuses when a client is created"
```

---

### Task 4: Password hashing helpers

**Files:**
- Create: `apps/web/lib/auth/password.ts`
- Test: `apps/web/lib/auth/__tests__/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>`, `generateRandomPassword(): string` — used by Task 6's `client-auth.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/auth/__tests__/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateRandomPassword } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hash1 = await hashPassword("same password");
    const hash2 = await hashPassword("same password");
    expect(hash1).not.toBe(hash2);
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("generateRandomPassword", () => {
  it("generates a password of reasonable length", () => {
    expect(generateRandomPassword().length).toBeGreaterThanOrEqual(12);
  });

  it("generates different passwords each call", () => {
    expect(generateRandomPassword()).not.toBe(generateRandomPassword());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- password`
Expected: FAIL — `../password` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/auth/password.ts`:

```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuf = Buffer.from(hashHex, "hex");
  if (derived.length !== storedBuf.length) return false;

  return timingSafeEqual(derived, storedBuf);
}

export function generateRandomPassword(): string {
  return randomBytes(12).toString("base64url");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- password`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/password.ts apps/web/lib/auth/__tests__/password.test.ts
git commit -m "Add password hashing helpers for client portal auth"
```

---

### Task 5: Session cookie signing helpers

**Files:**
- Create: `apps/web/lib/auth/client-session.ts`
- Test: `apps/web/lib/auth/__tests__/client-session.test.ts`

**Interfaces:**
- Produces: `CLIENT_SESSION_COOKIE_NAME: string`, `SESSION_MAX_AGE_SECONDS: number`, `signClientSession(clientId: string, expiresAt?: Date): string`, `verifyClientSession(cookieValue: string | undefined): { clientId: string } | null` — used by Task 6's `client-auth.ts` and `require-client-session.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/auth/__tests__/client-session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { signClientSession, verifyClientSession } from "../client-session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("signClientSession / verifyClientSession", () => {
  it("verifies a session it just signed", () => {
    const token = signClientSession("client-123");
    expect(verifyClientSession(token)).toEqual({ clientId: "client-123" });
  });

  it("rejects a tampered token", () => {
    const token = signClientSession("client-123");
    const tampered = token.replace("client-123", "client-456");
    expect(verifyClientSession(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signClientSession("client-123", new Date(Date.now() - 1000));
    expect(verifyClientSession(token)).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(verifyClientSession(undefined)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyClientSession("not.a.valid.token.at.all")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- client-session`
Expected: FAIL — `../client-session` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/auth/client-session.ts`:

```ts
import { createHmac, timingSafeEqual } from "crypto";

export const CLIENT_SESSION_COOKIE_NAME = "client_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export function signClientSession(
  clientId: string,
  expiresAt: Date = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
): string {
  const payload = `${clientId}.${expiresAt.getTime()}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyClientSession(cookieValue: string | undefined): { clientId: string } | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;

  const [clientId, expiresAtStr, signature] = parts;
  const payload = `${clientId}.${expiresAtStr}`;
  const expectedSignature = createHmac("sha256", getSecret()).update(payload).digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { clientId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- client-session`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/client-session.ts apps/web/lib/auth/__tests__/client-session.test.ts
git commit -m "Add signed session cookie helpers for client portal auth"
```

---

### Task 6: Client-auth server actions + route guard

**Files:**
- Create: `apps/web/lib/auth/require-client-session.ts`
- Create: `apps/web/lib/actions/client-auth.ts`
- Modify: `.env.example` (add `SESSION_SECRET`)

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`/`generateRandomPassword` (Task 4), `CLIENT_SESSION_COOKIE_NAME`/`SESSION_MAX_AGE_SECONDS`/`signClientSession`/`verifyClientSession` (Task 5).
- Produces: `requireClientSession(clientId: string): void` (redirects to login if invalid — call this at the top of every protected portal page); `loginClientAction(clientId: string, formData: FormData): Promise<void>`, `logoutClientAction(clientId: string): Promise<void>`, `regenerateClientPasswordAction(clientId: string): Promise<string>`, `changeClientPasswordAction(clientId: string, formData: FormData): Promise<void>` — used by Tasks 7, 8, 17.

- [ ] **Step 1: Write the route guard**

Create `apps/web/lib/auth/require-client-session.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIENT_SESSION_COOKIE_NAME, verifyClientSession } from "./client-session";

/**
 * Call at the top of every protected `/client/[clientId]/*` page. Verifies
 * the session cookie belongs to THIS client, not just that some valid
 * session exists — otherwise a logged-in client could view another
 * client's leads by editing the URL.
 */
export function requireClientSession(clientId: string): void {
  const cookieValue = cookies().get(CLIENT_SESSION_COOKIE_NAME)?.value;
  const session = verifyClientSession(cookieValue);
  if (!session || session.clientId !== clientId) {
    redirect(`/client/${clientId}/login`);
  }
}
```

- [ ] **Step 2: Write the client-auth server actions**

Create `apps/web/lib/actions/client-auth.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword, generateRandomPassword } from "@/lib/auth/password";
import { CLIENT_SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signClientSession } from "@/lib/auth/client-session";

export async function loginClientAction(clientId: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const hash = client?.crm_password_hash as string | null;

  if (!hash || !(await verifyPassword(password, hash))) {
    redirect(`/client/${clientId}/login?error=1`);
  }

  cookies().set(CLIENT_SESSION_COOKIE_NAME, signClientSession(clientId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect(`/client/${clientId}/crm`);
}

export async function logoutClientAction(clientId: string) {
  cookies().delete(CLIENT_SESSION_COOKIE_NAME);
  redirect(`/client/${clientId}/login`);
}

export async function regenerateClientPasswordAction(clientId: string): Promise<string> {
  const supabase = supabaseAdmin();
  const newPassword = generateRandomPassword();
  const hash = await hashPassword(newPassword);
  const { error } = await supabase.from("clients").update({ crm_password_hash: hash }).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}/edit`);
  return newPassword;
}

export async function changeClientPasswordAction(clientId: string, formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");

  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("crm_password_hash").eq("id", clientId).maybeSingle();
  const hash = client?.crm_password_hash as string | null;

  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    redirect(`/client/${clientId}/crm?password_error=wrong_password`);
  }
  if (newPassword.length < 8) {
    redirect(`/client/${clientId}/crm?password_error=too_short`);
  }

  const newHash = await hashPassword(newPassword);
  const { error } = await supabase.from("clients").update({ crm_password_hash: newHash }).eq("id", clientId);
  if (error) throw new Error(error.message);
  redirect(`/client/${clientId}/crm?password_success=1`);
}
```

- [ ] **Step 3: Add `SESSION_SECRET` to `.env.example`**

In `.env.example`, add (near the top, after the Supabase section):

```
# HMAC secret signing client-portal session cookies — any long random string
SESSION_SECRET=dev-local-session-secret-change-me
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: this file's portion is clean (repo-wide errors from Task 1 not yet resolved by later tasks are still expected).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth/require-client-session.ts apps/web/lib/actions/client-auth.ts .env.example
git commit -m "Add client portal login/logout/password server actions and route guard"
```

---

### Task 7: Client login page

**Files:**
- Create: `apps/web/app/client/[clientId]/login/page.tsx`

**Interfaces:**
- Consumes: `loginClientAction` (Task 6).

- [ ] **Step 1: Write the login page**

Create `apps/web/app/client/[clientId]/login/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loginClientAction } from "@/lib/actions/client-auth";

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { error?: string };
}) {
  const supabase = supabaseAdmin();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", params.clientId).maybeSingle();
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-sm pt-24">
      <h1 className="mb-6 text-center text-xl font-bold">כניסה לאזור הלקוח — {client.name as string}</h1>
      <form action={loginClientAction.bind(null, params.clientId)} className="card space-y-3">
        <input className="input" type="password" name="password" placeholder="סיסמה" required autoFocus />
        {searchParams.error && <p className="text-sm text-red-600">סיסמה שגויה.</p>}
        <button type="submit" className="btn btn-primary w-full">
          כניסה
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/client/[clientId]/login/page.tsx
git commit -m "Add client portal login page"
```

---

### Task 8: Admin-side password management on the client edit page

**Files:**
- Create: `apps/web/components/regenerate-password-button.tsx`
- Modify: `apps/web/app/clients/[id]/edit/page.tsx` (insert a new "פורטל הלקוח" card)

**Interfaces:**
- Consumes: `regenerateClientPasswordAction` (Task 6).

- [ ] **Step 1: Write the regenerate-password button**

Create `apps/web/components/regenerate-password-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { regenerateClientPasswordAction } from "@/lib/actions/client-auth";

export function RegeneratePasswordButton({ clientId }: { clientId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const newPassword = await regenerateClientPasswordAction(clientId);
    setPassword(newPassword);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={handleClick}>
        {pending ? "יוצר..." : "צור סיסמה חדשה"}
      </button>
      {password && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">הסיסמה החדשה (מוצגת פעם אחת בלבד — העתק עכשיו):</p>
          <code className="font-mono">{password}</code>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the portal card to the client edit page**

In `apps/web/app/clients/[id]/edit/page.tsx`:
- Add `import { RegeneratePasswordButton } from "@/components/regenerate-password-button";` to the imports.
- Insert a new card right before the "חיבור Meta Ads" card:

```tsx
        <div className="card space-y-3">
          <h2 className="font-semibold">פורטל הלקוח</h2>
          <p className="text-sm text-slate-500">
            קישור לאזור הלקוח:{" "}
            <code className="font-mono">{`${process.env.APP_BASE_URL ?? ""}/client/${c.id}/crm`}</code>
          </p>
          <p className="text-sm text-slate-500">
            {c.crm_password_hash ? "מוגדרת סיסמה." : "טרם הוגדרה סיסמה — צור אחת כדי לאפשר כניסה."}
          </p>
          <RegeneratePasswordButton clientId={c.id} />
        </div>

```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/regenerate-password-button.tsx apps/web/app/clients/[id]/edit/page.tsx
git commit -m "Add client portal URL and password management to the client edit page"
```

---

### Task 9: Pure status business rules

**Files:**
- Create: `apps/web/lib/crm/status-rules.ts`
- Test: `apps/web/lib/crm/__tests__/status-rules.test.ts`

**Interfaces:**
- Consumes: `LeadStatus`, `LeadStatusKind` (Task 1).
- Produces: `computeStatusChangePatch(kind: LeadStatusKind, dealValue?: number | null, now?: Date): { closed_at?: string; deal_value?: number }`, `planStatusDeletion(statuses: LeadStatus[], statusIdToDelete: string): { reassignToStatusId: string; newDefaultStatusId?: string }` (throws on invalid deletion) — used by Task 10 (`lead-statuses.ts`) and Task 12 (`leads.ts`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/crm/__tests__/status-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeStatusChangePatch, planStatusDeletion } from "../status-rules";
import type { LeadStatus } from "@dashboard-lior/shared";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("computeStatusChangePatch", () => {
  it("returns an empty patch for an open status", () => {
    expect(computeStatusChangePatch("open", null, NOW)).toEqual({});
  });

  it("sets closed_at for a won status with no deal value", () => {
    expect(computeStatusChangePatch("won", null, NOW)).toEqual({ closed_at: NOW.toISOString() });
  });

  it("sets closed_at and deal_value for a won status with a deal value", () => {
    expect(computeStatusChangePatch("won", 3200, NOW)).toEqual({ closed_at: NOW.toISOString(), deal_value: 3200 });
  });

  it("sets closed_at but not deal_value for a lost status", () => {
    expect(computeStatusChangePatch("lost", 3200, NOW)).toEqual({ closed_at: NOW.toISOString() });
  });
});

function makeStatus(overrides: Partial<LeadStatus>): LeadStatus {
  return { id: "id", client_id: "client", label: "label", kind: "open", sort_order: 0, is_default: false, ...overrides };
}

describe("planStatusDeletion", () => {
  it("throws when the status doesn't exist", () => {
    expect(() => planStatusDeletion([], "missing")).toThrow();
  });

  it("throws when trying to delete a won status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "won" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("throws when trying to delete a lost status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "lost" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("throws when it's the last remaining open status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "open" }), makeStatus({ id: "s2", kind: "won" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("reassigns to the other open status's default when deleting a non-default open status", () => {
    const statuses = [
      makeStatus({ id: "s1", kind: "open", is_default: false }),
      makeStatus({ id: "s2", kind: "open", is_default: true }),
    ];
    expect(planStatusDeletion(statuses, "s1")).toEqual({ reassignToStatusId: "s2" });
  });

  it("promotes another open status to default when deleting the current default", () => {
    const statuses = [
      makeStatus({ id: "s1", kind: "open", is_default: true }),
      makeStatus({ id: "s2", kind: "open", is_default: false }),
    ];
    expect(planStatusDeletion(statuses, "s1")).toEqual({ reassignToStatusId: "s2", newDefaultStatusId: "s2" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- status-rules`
Expected: FAIL — `../status-rules` module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/crm/status-rules.ts`:

```ts
import type { LeadStatus, LeadStatusKind } from "@dashboard-lior/shared";

export function computeStatusChangePatch(
  kind: LeadStatusKind,
  dealValue?: number | null,
  now: Date = new Date()
): { closed_at?: string; deal_value?: number } {
  if (kind === "open") return {};
  const patch: { closed_at?: string; deal_value?: number } = { closed_at: now.toISOString() };
  if (kind === "won" && dealValue != null) patch.deal_value = dealValue;
  return patch;
}

export function planStatusDeletion(
  statuses: LeadStatus[],
  statusIdToDelete: string
): { reassignToStatusId: string; newDefaultStatusId?: string } {
  const target = statuses.find((s) => s.id === statusIdToDelete);
  if (!target) throw new Error("סטטוס לא נמצא");
  if (target.kind !== "open") throw new Error("לא ניתן למחוק סטטוס קבוע (נסגר/אבד)");

  const otherOpen = statuses.filter((s) => s.kind === "open" && s.id !== statusIdToDelete);
  if (otherOpen.length === 0) throw new Error("חייב להישאר לפחות סטטוס פתוח אחד");

  const reassignTarget = otherOpen.find((s) => s.is_default) ?? otherOpen[0];
  const needsNewDefault = target.is_default && !reassignTarget.is_default;

  return {
    reassignToStatusId: reassignTarget.id,
    newDefaultStatusId: needsNewDefault ? reassignTarget.id : undefined,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- status-rules`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/crm/status-rules.ts apps/web/lib/crm/__tests__/status-rules.test.ts
git commit -m "Add pure lead-status change/deletion business rules"
```

---

### Task 10: Lead status CRUD server actions

**Files:**
- Create: `apps/web/lib/actions/lead-statuses.ts`

**Interfaces:**
- Consumes: `planStatusDeletion` (Task 9).
- Produces: `createLeadStatus(clientId: string, label: string): Promise<void>`, `renameLeadStatus(statusId: string, clientId: string, label: string): Promise<void>`, `deleteLeadStatus(statusId: string, clientId: string): Promise<void>`, `setDefaultLeadStatus(statusId: string, clientId: string): Promise<void>`, `reorderLeadStatus(statusId: string, clientId: string, direction: "up" | "down"): Promise<void>` — used by Task 15 (`CrmManagePanel`).

- [ ] **Step 1: Write the actions**

Create `apps/web/lib/actions/lead-statuses.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadStatus } from "@dashboard-lior/shared";
import { planStatusDeletion } from "@/lib/crm/status-rules";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLeadStatus(clientId: string, label: string) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("lead_statuses")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase
    .from("lead_statuses")
    .insert({ client_id: clientId, label, kind: "open", sort_order: nextSortOrder, is_default: false });
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function renameLeadStatus(statusId: string, clientId: string, label: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_statuses").update({ label }).eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLeadStatus(statusId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { data: statuses, error: fetchError } = await supabase.from("lead_statuses").select("*").eq("client_id", clientId);
  if (fetchError) throw new Error(fetchError.message);

  const plan = planStatusDeletion((statuses ?? []) as LeadStatus[], statusId);

  await supabase.from("leads").update({ status_id: plan.reassignToStatusId }).eq("status_id", statusId);
  if (plan.newDefaultStatusId) {
    await supabase.from("lead_statuses").update({ is_default: true }).eq("id", plan.newDefaultStatusId);
  }
  const { error } = await supabase.from("lead_statuses").delete().eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function setDefaultLeadStatus(statusId: string, clientId: string) {
  const supabase = supabaseAdmin();
  await supabase.from("lead_statuses").update({ is_default: false }).eq("client_id", clientId).eq("is_default", true);
  const { error } = await supabase.from("lead_statuses").update({ is_default: true }).eq("id", statusId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function reorderLeadStatus(statusId: string, clientId: string, direction: "up" | "down") {
  const supabase = supabaseAdmin();
  const { data: statuses } = await supabase
    .from("lead_statuses")
    .select("id, sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true });
  const rows = (statuses ?? []) as { id: string; sort_order: number }[];

  const index = rows.findIndex((r) => r.id === statusId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return;

  const a = rows[index];
  const b = rows[swapIndex];
  await supabase.from("lead_statuses").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("lead_statuses").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateCrm(clientId);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions/lead-statuses.ts
git commit -m "Add lead status CRUD server actions"
```

---

### Task 11: Lead column CRUD server actions

**Files:**
- Create: `apps/web/lib/actions/lead-columns.ts`

**Interfaces:**
- Consumes: `LeadColumnType` (Task 1).
- Produces: `createLeadColumn(clientId: string, name: string, type: LeadColumnType): Promise<void>`, `renameLeadColumn(columnId: string, clientId: string, name: string): Promise<void>`, `deleteLeadColumn(columnId: string, clientId: string): Promise<void>`, `reorderLeadColumn(columnId: string, clientId: string, direction: "up" | "down"): Promise<void>` — used by Task 15 (`CrmManagePanel`).

- [ ] **Step 1: Write the actions**

Create `apps/web/lib/actions/lead-columns.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadColumnType } from "@dashboard-lior/shared";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLeadColumn(clientId: string, name: string, type: LeadColumnType) {
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("lead_columns")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { error } = await supabase.from("lead_columns").insert({ client_id: clientId, name, type, sort_order: nextSortOrder });
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function renameLeadColumn(columnId: string, clientId: string, name: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_columns").update({ name }).eq("id", columnId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLeadColumn(columnId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("lead_columns").delete().eq("id", columnId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function reorderLeadColumn(columnId: string, clientId: string, direction: "up" | "down") {
  const supabase = supabaseAdmin();
  const { data: columns } = await supabase
    .from("lead_columns")
    .select("id, sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true });
  const rows = (columns ?? []) as { id: string; sort_order: number }[];

  const index = rows.findIndex((r) => r.id === columnId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return;

  const a = rows[index];
  const b = rows[swapIndex];
  await supabase.from("lead_columns").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("lead_columns").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateCrm(clientId);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/actions/lead-columns.ts
git commit -m "Add lead column CRUD server actions"
```

---

### Task 12: Rewrite lead actions for the new schema

**Files:**
- Modify: `apps/web/lib/actions/leads.ts` (full rewrite)
- Modify: `apps/web/app/api/webhooks/website-form/route.ts` (add optional `email` field)

**Interfaces:**
- Consumes: `computeStatusChangePatch` (Task 9).
- Produces: `createLead(input: { client_id: string; name?: string | null; phone?: string | null; email?: string | null; source_ad_id?: string | null; status_id?: string | null }): Promise<Lead>`, `createLeadFromForm(clientId: string, formData: FormData): Promise<void>`, `updateLeadField(leadId: string, clientId: string, field: string, value: string): Promise<void>` (field is `"name" | "phone" | "email"` or `` `custom:${columnId}` ``), `updateLeadStatus(leadId: string, clientId: string, statusId: string, dealValue?: number | null): Promise<void>`, `deleteLead(leadId: string, clientId: string): Promise<void>` — used by Task 14 (`CrmTable`).

- [ ] **Step 1: Rewrite `leads.ts`**

Replace the full contents of `apps/web/lib/actions/leads.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadStatusKind } from "@dashboard-lior/shared";
import { computeStatusChangePatch } from "@/lib/crm/status-rules";

function revalidateCrm(clientId: string) {
  revalidatePath(`/clients/${clientId}/crm`);
  revalidatePath(`/client/${clientId}/crm`);
}

export async function createLead(input: {
  client_id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source_ad_id?: string | null;
  status_id?: string | null;
}) {
  const supabase = supabaseAdmin();

  let statusId = input.status_id ?? null;
  if (!statusId) {
    const { data: defaultStatus } = await supabase
      .from("lead_statuses")
      .select("id")
      .eq("client_id", input.client_id)
      .eq("is_default", true)
      .maybeSingle();
    statusId = (defaultStatus?.id as string | undefined) ?? null;
  }
  if (!statusId) throw new Error("ללקוח הזה אין סטטוס ברירת מחדל מוגדר");

  const { data, error } = await supabase
    .from("leads")
    .insert({
      client_id: input.client_id,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source_ad_id: input.source_ad_id ?? null,
      status_id: statusId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidateCrm(input.client_id);
  return data;
}

export async function createLeadFromForm(clientId: string, formData: FormData) {
  await createLead({
    client_id: clientId,
    name: String(formData.get("name") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
  });
}

export async function updateLeadField(leadId: string, clientId: string, field: string, value: string) {
  const supabase = supabaseAdmin();

  if (field.startsWith("custom:")) {
    const columnId = field.slice("custom:".length);
    const [{ data: lead }, { data: column }] = await Promise.all([
      supabase.from("leads").select("custom_fields").eq("id", leadId).single(),
      supabase.from("lead_columns").select("type").eq("id", columnId).single(),
    ]);
    const currentFields = (lead?.custom_fields as Record<string, string | number>) ?? {};
    const parsedValue: string | number = column?.type === "number" ? Number(value) || 0 : value;
    const { error } = await supabase
      .from("leads")
      .update({ custom_fields: { ...currentFields, [columnId]: parsedValue } })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
  } else if (field === "name" || field === "phone" || field === "email") {
    const { error } = await supabase.from("leads").update({ [field]: value || null }).eq("id", leadId);
    if (error) throw new Error(error.message);
  } else {
    throw new Error(`שדה לא ידוע: ${field}`);
  }

  revalidateCrm(clientId);
}

export async function updateLeadStatus(leadId: string, clientId: string, statusId: string, dealValue?: number | null) {
  const supabase = supabaseAdmin();
  const { data: status } = await supabase.from("lead_statuses").select("kind").eq("id", statusId).single();
  if (!status) throw new Error("סטטוס לא נמצא");

  const patch = computeStatusChangePatch(status.kind as LeadStatusKind, dealValue);
  const { error } = await supabase.from("leads").update({ status_id: statusId, ...patch }).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}

export async function deleteLead(leadId: string, clientId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidateCrm(clientId);
}
```

- [ ] **Step 2: Add `email` to the website-form webhook schema**

In `apps/web/app/api/webhooks/website-form/route.ts`, add `email: z.string().optional(),` to `bodySchema` (after the `phone` line), and pass it through in the `createLead` call: add `email: parsed.data.email ?? null,`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/actions/leads.ts apps/web/app/api/webhooks/website-form/route.ts
git commit -m "Rewrite lead actions for per-client statuses/columns"
```

---

### Task 13: Update revenue/CPL calculations to resolve via lead_statuses.kind

**Files:**
- Modify: `apps/web/lib/analyzer/monthly-recalc.ts:41-46`
- Modify: `apps/web/app/page.tsx:12-21`

**Interfaces:**
- Consumes: `lead_statuses` table (Task 1).

- [ ] **Step 1: Update `recalcClientMaxCpl`'s won-deal-value query**

In `apps/web/lib/analyzer/monthly-recalc.ts`, replace the current `wonLeads` query (currently `.eq("stage", "won")`):

```ts
  const { data: wonStatus } = await supabase
    .from("lead_statuses")
    .select("id")
    .eq("client_id", clientId)
    .eq("kind", "won")
    .maybeSingle();

  const { data: wonLeads } = await supabase
    .from("leads")
    .select("deal_value")
    .eq("client_id", clientId)
    .eq("status_id", wonStatus?.id ?? "")
    .gte("created_at", since);
```

- [ ] **Step 2: Update the dashboard revenue query**

In `apps/web/app/page.tsx`, replace the `wonLeads` query inside the `Promise.all` (currently `supabase.from("leads").select("deal_value").eq("stage", "won").gte("created_at", since)`):

```ts
  const { data: wonStatuses } = await supabase.from("lead_statuses").select("id").eq("kind", "won");
  const wonStatusIds = (wonStatuses ?? []).map((s) => s.id as string);

  const [{ data: bottlenecks }, { data: clients }, { data: metrics }, { data: wonLeads }] = await Promise.all([
    supabase.from("sop_bottlenecks").select("*").order("days_stuck", { ascending: false }),
    supabase.from("clients").select("id"),
    supabase.from("ad_metrics_daily").select("spend").gte("date", since),
    wonStatusIds.length
      ? supabase.from("leads").select("deal_value").in("status_id", wonStatusIds).gte("created_at", since)
      : Promise.resolve({ data: [] as { deal_value: number | null }[] }),
  ]);
```

(This moves the `wonStatuses` lookup before the existing `Promise.all` block, since its result feeds into that block's `wonLeads` query.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors remaining anywhere in the repo from the Task 1 schema change — this is the last consumer of the old `stage`-based filtering. If any errors remain outside files this plan has touched, report them rather than guessing a fix.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/analyzer/monthly-recalc.ts apps/web/app/page.tsx
git commit -m "Resolve won-lead calculations via lead_statuses.kind instead of a literal stage string"
```

---

### Task 14: `CrmTable` component

**Files:**
- Create: `apps/web/components/crm-table.tsx`

**Interfaces:**
- Consumes: `updateLeadField`, `updateLeadStatus`, `deleteLead`, `createLeadFromForm` (Task 12), `Lead`, `LeadStatus`, `LeadColumn` (Task 1).
- Produces: `<CrmTable clientId={string} leads={Lead[]} statuses={LeadStatus[]} columns={LeadColumn[]} />` — used by Task 16 (internal CRM page) and Task 17 (portal CRM page).

- [ ] **Step 1: Write the component**

Create `apps/web/components/crm-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";
import { updateLeadField, updateLeadStatus, deleteLead, createLeadFromForm } from "@/lib/actions/leads";

const KIND_BADGE_CLASS: Record<LeadStatus["kind"], string> = {
  open: "badge-insufficient",
  won: "badge-winner",
  lost: "badge-kill",
};

function EditableCell({
  value,
  onSave,
  type = "text",
}: {
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "number";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="block w-full rounded px-1 py-0.5 text-right hover:bg-slate-50"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || "—"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="input"
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

export function CrmTable({
  clientId,
  leads,
  statuses,
  columns,
}: {
  clientId: string;
  leads: Lead[];
  statuses: LeadStatus[];
  columns: LeadColumn[];
}) {
  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-slate-500">
            <th className="p-2 font-normal">שם</th>
            <th className="p-2 font-normal">טלפון</th>
            <th className="p-2 font-normal">אימייל</th>
            <th className="p-2 font-normal">סטטוס</th>
            {sortedColumns.map((col) => (
              <th key={col.id} className="p-2 font-normal">
                {col.name}
              </th>
            ))}
            <th className="p-2 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => {
            const status = sortedStatuses.find((s) => s.id === lead.status_id);
            return (
              <tr key={lead.id}>
                <td className="p-1">
                  <EditableCell value={lead.name ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "name", v)} />
                </td>
                <td className="p-1">
                  <EditableCell value={lead.phone ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "phone", v)} />
                </td>
                <td className="p-1">
                  <EditableCell value={lead.email ?? ""} onSave={(v) => updateLeadField(lead.id, clientId, "email", v)} />
                </td>
                <td className="p-1">
                  <select
                    className={`badge ${KIND_BADGE_CLASS[status?.kind ?? "open"]}`}
                    value={lead.status_id}
                    onChange={(e) => updateLeadStatus(lead.id, clientId, e.target.value)}
                  >
                    {sortedStatuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                {sortedColumns.map((col) => (
                  <td key={col.id} className="p-1">
                    <EditableCell
                      value={String(lead.custom_fields[col.id] ?? "")}
                      type={col.type === "number" ? "number" : "text"}
                      onSave={(v) => updateLeadField(lead.id, clientId, `custom:${col.id}`, v)}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button type="button" className="btn btn-secondary text-xs" onClick={() => deleteLead(lead.id, clientId)}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form action={createLeadFromForm.bind(null, clientId)} className="mt-4 flex flex-wrap gap-2">
        <input className="input flex-1" name="name" placeholder="שם" />
        <input className="input flex-1" name="phone" placeholder="טלפון" />
        <input className="input flex-1" name="email" placeholder="אימייל" />
        <button type="submit" className="btn btn-primary">
          + ליד חדש
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/crm-table.tsx
git commit -m "Add shared Monday-style CRM table component"
```

---

### Task 15: `CrmManagePanel` component

**Files:**
- Create: `apps/web/components/crm-manage-panel.tsx`

**Interfaces:**
- Consumes: `createLeadStatus`, `renameLeadStatus`, `deleteLeadStatus`, `setDefaultLeadStatus`, `reorderLeadStatus` (Task 10), `createLeadColumn`, `renameLeadColumn`, `deleteLeadColumn`, `reorderLeadColumn` (Task 11), `LeadStatus`, `LeadColumn` (Task 1).
- Produces: `<CrmManagePanel clientId={string} statuses={LeadStatus[]} columns={LeadColumn[]} />` — used by Task 16 and Task 17.

- [ ] **Step 1: Write the component**

Create `apps/web/components/crm-manage-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { LeadStatus, LeadColumn, LeadColumnType } from "@dashboard-lior/shared";
import { createLeadStatus, renameLeadStatus, deleteLeadStatus, setDefaultLeadStatus, reorderLeadStatus } from "@/lib/actions/lead-statuses";
import { createLeadColumn, renameLeadColumn, deleteLeadColumn, reorderLeadColumn } from "@/lib/actions/lead-columns";

function EditableLabel({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded px-1 py-0.5 text-right hover:bg-slate-50"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() && draft !== value) onSave(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

export function CrmManagePanel({
  clientId,
  statuses,
  columns,
}: {
  clientId: string;
  statuses: LeadStatus[];
  columns: LeadColumn[];
}) {
  const [open, setOpen] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<LeadColumnType>("text");

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const sortedColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary mb-4" onClick={() => setOpen(true)}>
        ⚙ ניהול סטטוסים ועמודות
      </button>
    );
  }

  return (
    <div className="card mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ניהול סטטוסים ועמודות</h2>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => setOpen(false)}>
          סגור
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">סטטוסים</h3>
        <div className="space-y-1">
          {sortedStatuses.map((status) => (
            <div key={status.id} className="flex items-center gap-2 text-sm">
              <span className="flex flex-1 items-center">
                <EditableLabel value={status.label} onSave={(label) => renameLeadStatus(status.id, clientId, label)} />
                {status.kind !== "open" && <span className="text-xs text-slate-400"> (קבוע)</span>}
                {status.is_default && <span className="text-xs text-slate-400"> · ברירת מחדל</span>}
              </span>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => reorderLeadStatus(status.id, clientId, "up")}>
                ↑
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => reorderLeadStatus(status.id, clientId, "down")}>
                ↓
              </button>
              {status.kind === "open" && !status.is_default && (
                <button type="button" className="btn btn-secondary text-xs" onClick={() => setDefaultLeadStatus(status.id, clientId)}>
                  הפוך לברירת מחדל
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                disabled={status.kind !== "open"}
                title={status.kind !== "open" ? "לא ניתן למחוק סטטוס קבוע (נסגר/אבד) — נדרש לחישובי הכנסות" : undefined}
                onClick={() => deleteLeadStatus(status.id, clientId)}
              >
                מחק
              </button>
            </div>
          ))}
        </div>
        <form
          action={() => {
            if (newStatusLabel.trim()) createLeadStatus(clientId, newStatusLabel.trim());
            setNewStatusLabel("");
          }}
          className="mt-2 flex gap-2"
        >
          <input className="input" placeholder="סטטוס חדש" value={newStatusLabel} onChange={(e) => setNewStatusLabel(e.target.value)} />
          <button type="submit" className="btn btn-secondary text-xs">
            + הוסף
          </button>
        </form>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">עמודות מותאמות אישית</h3>
        <div className="space-y-1">
          {sortedColumns.map((col) => (
            <div key={col.id} className="flex items-center gap-2 text-sm">
              <span className="flex flex-1 items-center">
                <EditableLabel value={col.name} onSave={(name) => renameLeadColumn(col.id, clientId, name)} />
                <span className="text-xs text-slate-400"> ({col.type === "number" ? "מספר" : "טקסט"})</span>
              </span>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => reorderLeadColumn(col.id, clientId, "up")}>
                ↑
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => reorderLeadColumn(col.id, clientId, "down")}>
                ↓
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => deleteLeadColumn(col.id, clientId)}>
                מחק
              </button>
            </div>
          ))}
        </div>
        <form
          action={() => {
            if (newColumnName.trim()) createLeadColumn(clientId, newColumnName.trim(), newColumnType);
            setNewColumnName("");
          }}
          className="mt-2 flex gap-2"
        >
          <input className="input" placeholder="שם עמודה" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} />
          <select className="input w-28" value={newColumnType} onChange={(e) => setNewColumnType(e.target.value as LeadColumnType)}>
            <option value="text">טקסט</option>
            <option value="number">מספר</option>
          </select>
          <button type="submit" className="btn btn-secondary text-xs">
            + הוסף
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/crm-manage-panel.tsx
git commit -m "Add status/column management panel component"
```

---

### Task 16: Wire the internal CRM page to the unified table

**Files:**
- Modify: `apps/web/app/clients/[id]/crm/page.tsx` (full rewrite)
- Delete: `apps/web/components/lead-card.tsx`

**Interfaces:**
- Consumes: `<CrmTable>` (Task 14), `<CrmManagePanel>` (Task 15).

- [ ] **Step 1: Rewrite the internal CRM page**

Replace the full contents of `apps/web/app/clients/[id]/crm/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientTabs } from "@/components/client-tabs";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientCrmPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.id).single(),
    supabase.from("leads").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.id),
    supabase.from("lead_columns").select("*").eq("client_id", params.id),
  ]);
  if (!client) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{client.name as string}</h1>
      <ClientTabs clientId={params.id} active="crm" />
      <CrmManagePanel clientId={params.id} statuses={(statuses ?? []) as LeadStatus[]} columns={(columns ?? []) as LeadColumn[]} />
      <CrmTable
        clientId={params.id}
        leads={(leads ?? []) as Lead[]}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={(columns ?? []) as LeadColumn[]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old kanban card component**

```bash
git rm apps/web/components/lead-card.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/clients/[id]/crm/page.tsx apps/web/components/lead-card.tsx
git commit -m "Replace internal lead kanban with the unified CRM table"
```

---

### Task 17: Client portal CRM page

**Files:**
- Create: `apps/web/components/client-portal-header.tsx`
- Modify: `apps/web/app/client/[clientId]/crm/page.tsx` (replace the stub)

**Interfaces:**
- Consumes: `requireClientSession` (Task 6), `logoutClientAction`, `changeClientPasswordAction` (Task 6), `<CrmTable>` (Task 14), `<CrmManagePanel>` (Task 15).

- [ ] **Step 1: Write the portal header (logout + change-password)**

Create `apps/web/components/client-portal-header.tsx`:

```tsx
"use client";

import { useState } from "react";
import { logoutClientAction, changeClientPasswordAction } from "@/lib/actions/client-auth";

export function ClientPortalHeader({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{clientName}</h1>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setShowPasswordForm((v) => !v)}>
            שינוי סיסמה
          </button>
          <form action={logoutClientAction.bind(null, clientId)}>
            <button type="submit" className="btn btn-secondary text-sm">
              התנתק
            </button>
          </form>
        </div>
      </div>
      {showPasswordForm && (
        <form action={changeClientPasswordAction.bind(null, clientId)} className="card mt-3 max-w-sm space-y-2">
          <p className="text-xs text-amber-700">
            שים לב: סיסמה חלשה או שנשלחה למישהו אחר עלולה לחשוף את הלידים שלך. שמור על הסיסמה בסודיות.
          </p>
          <input className="input" type="password" name="current_password" placeholder="סיסמה נוכחית" required />
          <input className="input" type="password" name="new_password" placeholder="סיסמה חדשה (8+ תווים)" required minLength={8} />
          <button type="submit" className="btn btn-primary text-sm">
            עדכן סיסמה
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the client portal CRM page stub**

Replace the full contents of `apps/web/app/client/[clientId]/crm/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireClientSession } from "@/lib/auth/require-client-session";
import { CrmTable } from "@/components/crm-table";
import { CrmManagePanel } from "@/components/crm-manage-panel";
import { ClientPortalHeader } from "@/components/client-portal-header";
import type { Lead, LeadStatus, LeadColumn } from "@dashboard-lior/shared";

export const dynamic = "force-dynamic";

export default async function ClientPortalCrmPage({ params }: { params: { clientId: string } }) {
  requireClientSession(params.clientId);

  const supabase = supabaseAdmin();
  const [{ data: client }, { data: leads }, { data: statuses }, { data: columns }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", params.clientId).single(),
    supabase.from("leads").select("*").eq("client_id", params.clientId).order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("*").eq("client_id", params.clientId),
    supabase.from("lead_columns").select("*").eq("client_id", params.clientId),
  ]);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <ClientPortalHeader clientId={params.clientId} clientName={client.name as string} />
      <CrmManagePanel clientId={params.clientId} statuses={(statuses ?? []) as LeadStatus[]} columns={(columns ?? []) as LeadColumn[]} />
      <CrmTable
        clientId={params.clientId}
        leads={(leads ?? []) as Lead[]}
        statuses={(statuses ?? []) as LeadStatus[]}
        columns={(columns ?? []) as LeadColumn[]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npm run typecheck`
Run: `npm run test`
Expected: both clean — this is the last task in the plan, so the whole repo should compile and every test (existing + new) should pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/client-portal-header.tsx apps/web/app/client/[clientId]/crm/page.tsx
git commit -m "Replace client portal CRM stub with the authenticated unified table"
```

---

## Self-Review Notes

- **Spec coverage:** Section A (data model) → Tasks 1-3. Section B (calculation call sites) → Task 13 (plus Task 12's `updateLeadStatus`, which replaces the old `updateLeadStage`'s literal-string check). Section C (auth) → Tasks 4-8, 17. Section D (unified table) → Tasks 14-17.
- **Type consistency:** `LeadStatus`/`LeadStatusKind`/`LeadColumn`/`LeadColumnType` (Task 1) are used identically across Tasks 9-17 — no renaming drift. `computeStatusChangePatch`/`planStatusDeletion` (Task 9) signatures match exactly what Task 10/12 import. `CrmTable`/`CrmManagePanel` prop shapes (Tasks 14-15) match exactly what Tasks 16-17 pass in.
- **Ordering rationale:** Task 13 (the calculation-site fix) is placed after Task 12 (which introduces `computeStatusChangePatch`/`lead_statuses` usage in the main `leads.ts` actions) so that by the time Task 13 runs, `npm run typecheck` cleanly isolates the *remaining* `stage`-based errors to exactly the two files Task 13 touches — this was called out explicitly in Task 1's and Task 13's verification steps so an implementer mid-plan isn't alarmed by expected, temporary typecheck failures.
- **Reordering UI:** the design spec says "reorder" for both statuses and columns without mandating a mechanism; this plan uses simple ↑/↓ buttons (Tasks 10, 11, 15) rather than drag-and-drop, to keep the management panel's interaction model simple given it already has several other controls per row (rename, delete, set-default). This doesn't contradict the spec, just picks a concrete, lower-complexity mechanism.
