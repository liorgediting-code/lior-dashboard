-- Phase 20: Instagram insights + Drive-backed video review.
--
-- Two independent features share one migration because they ship together;
-- nothing here couples them.

-- === Instagram insights ==================================================
--
-- Reached through hookmyapp's Meta gateway
-- (https://gateway.hookmyapp.com/meta/v25.0) rather than a Meta app of our
-- own — see lib/instagram/client.ts. That means no OAuth and no app review,
-- but it also means the credential is a hookmyapp CHANNEL token, not a Meta
-- user token; it is per-channel and rotatable from the hookmyapp CLI.
--
-- Rows are keyed by `ig_account_id` (the Instagram user id) rather than by
-- client_id. Today there is exactly one account — the agency's own — but
-- keying by account costs nothing now and is what lets a per-client account
-- be added later without rewriting every query.

create table ig_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  ig_account_id text not null,
  date date not null,
  -- All nullable on purpose: Meta returns metrics it cannot serve in an
  -- `unavailable[]` list instead of erroring, and suppresses values it
  -- considers too small to be anonymous. A missing metric is normal
  -- operation, not a sync failure, so it must be storable as null.
  reach integer,
  views integer,
  total_interactions integer,
  profile_views integer,
  followers_count integer,
  created_at timestamptz not null default now()
);

-- The sync re-reads a trailing window every run because Instagram insights
-- lag up to 48h and late-arriving numbers revise earlier days. Upserting on
-- (account, date) makes the sync idempotent and self-correcting.
create unique index ig_daily_metrics_account_date_idx
  on ig_daily_metrics (ig_account_id, date);

alter table ig_daily_metrics disable row level security;

-- Per-post record. Post metrics and post metadata are fetched from two
-- different Graph edges (/media and /{media-id}/insights) but there is one
-- row per post, so `metrics_synced_at` tracks the insights half separately
-- from the row's own freshness.
create table ig_media (
  id uuid primary key default gen_random_uuid(),
  ig_account_id text not null,
  media_id text not null,
  media_type text,
  caption text,
  permalink text,
  thumbnail_url text,
  posted_at timestamptz,
  views integer,
  reach integer,
  likes integer,
  comments_count integer,
  saved integer,
  shares integer,
  metrics_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index ig_media_account_media_idx
  on ig_media (ig_account_id, media_id);

alter table ig_media disable row level security;

-- === Drive-backed video review ===========================================
--
-- Videos are NOT uploaded here — they are read from a Google Drive folder
-- the agency already fills. We store only the file id plus metadata, and
-- stream the bytes through /api/videos/[id]/stream on demand.
alter table clients add column drive_folder_id text;

create table client_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  drive_file_id text not null,
  name text not null,
  mime_type text,
  size_bytes bigint,
  -- Drive reports duration in milliseconds and only for files it has
  -- finished processing, so this stays null until it is known rather than
  -- defaulting to 0 (which would render as a zero-length scrub bar).
  duration_seconds numeric,
  thumbnail_url text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Scoped to the client, not global: the same file can legitimately be
-- shared into two clients' folders, and a global unique would make the
-- second client's sync fail rather than list it.
create unique index client_videos_client_file_idx
  on client_videos (client_id, drive_file_id);

alter table client_videos disable row level security;

create table video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references client_videos(id) on delete cascade,
  -- Denormalised from client_videos so the stream/comment routes can check
  -- ownership without a join on every request. Kept in sync by the app;
  -- the video's own client_id remains the source of truth.
  client_id uuid not null references clients(id) on delete cascade,
  -- Numeric, not integer: a fix at 12.4s must not snap to 12s, or the
  -- reviewer and the editor are looking at different frames.
  timestamp_seconds numeric not null,
  body text not null default '',
  -- Freehand annotation, or null for a text-only note. Shape:
  --   { "strokes": [{ "color": "#ef4444", "width": 3,
  --                   "points": [[x, y], ...] }] }
  -- Coordinates are NORMALISED to 0..1 against the video's display box, so
  -- a drawing made on a phone still lands on the right spot on a desktop
  -- player. Storing pixels here would make every annotation drift.
  drawing jsonb,
  author_kind text not null check (author_kind in ('client', 'agency')),
  author_name text,
  -- Lets the agency tick off a fix once it is done. Not an approval
  -- workflow — just "handled", so a long list stays readable.
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- The player loads every comment for one video ordered along the timeline,
-- which is exactly this index.
create index video_comments_video_time_idx
  on video_comments (video_id, timestamp_seconds);

alter table video_comments disable row level security;
