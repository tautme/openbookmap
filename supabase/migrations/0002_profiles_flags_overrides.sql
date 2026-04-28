-- =============================================================================
-- OpenBookMap · Migration 0002 — profiles extension, flags, shop_overrides
-- =============================================================================
-- Additive: never touches 0001_initial.sql. Safe to re-run.
--
-- What this adds:
--   1. profiles.username (unique), profiles.bio, profiles.avatar_url
--   2. books.isbn, books.language, books.genre
--   3. photos.thumb_path, photos.display_path
--   4. new table `flags`   — user-reported problems (read is reporter-only)
--   5. new table `shop_overrides` — project-specific corrections to OSM shops
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PROFILES · extend
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username   text,
  add column if not exists bio        text,
  add column if not exists avatar_url text;

-- Lowercase, dash-safe usernames. Enforce in application too; this is a backstop.
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9\-]{2,23}$');

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;


-- -----------------------------------------------------------------------------
-- 2. BOOKS · extend
-- -----------------------------------------------------------------------------
alter table public.books
  add column if not exists isbn     text,
  add column if not exists language text,  -- 2-letter ISO 639-1 code
  add column if not exists genre    text;

alter table public.books
  drop constraint if exists books_language_format;
alter table public.books
  add constraint books_language_format
  check (language is null or language ~ '^[a-z]{2}$');

create index if not exists books_isbn_idx on public.books (isbn) where isbn is not null;


-- -----------------------------------------------------------------------------
-- 3. PHOTOS · add thumb + display derivatives
-- -----------------------------------------------------------------------------
-- `storage_path` remains the canonical (display-size) image path for back-
-- compat. `thumb_path` is the grid thumbnail. `display_path` is set by new
-- uploads and may equal `storage_path` for older rows.
alter table public.photos
  add column if not exists thumb_path   text,
  add column if not exists display_path text;


-- -----------------------------------------------------------------------------
-- 4. FLAGS · reporter-only read (no public moderation yet)
-- -----------------------------------------------------------------------------
create table if not exists public.flags (
  id            uuid primary key default uuid_generate_v4(),
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  target_type   text not null check (target_type in ('photo', 'book', 'shop')),
  target_id     uuid not null,
  reason        text not null check (reason in (
                  'wrong_title',
                  'bad_photo',
                  'not_a_bookstore',
                  'other'
                )),
  notes         text,
  resolved_at   timestamptz,
  resolver_id   uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

create index if not exists flags_target_idx   on public.flags (target_type, target_id);
create index if not exists flags_reporter_idx on public.flags (reporter_id);

alter table public.flags enable row level security;

drop policy if exists "flags_select_reporter" on public.flags;
drop policy if exists "flags_insert_own"      on public.flags;

-- Reporter can read their own flags. (Future: add a moderators role and OR it.)
create policy "flags_select_reporter" on public.flags
  for select using (auth.uid() = reporter_id);

-- Authenticated users can file flags, must tag themselves as reporter.
create policy "flags_insert_own" on public.flags
  for insert with check (auth.uid() = reporter_id);


-- -----------------------------------------------------------------------------
-- 5. SHOP_OVERRIDES · project-side corrections to OSM data
-- -----------------------------------------------------------------------------
-- One row per shop; nullable columns for the fields we may override.
-- Merging strategy (application-side): prefer override_* when non-null, else OSM.
create table if not exists public.shop_overrides (
  shop_id                    uuid primary key references public.shops(id) on delete cascade,
  override_name              text,
  override_website           text,
  override_hours             text,            -- free-form; OSM's opening_hours spec is heavy
  override_closed_at         date,            -- shop appears permanently closed
  override_storefront_photo  uuid references public.photos(id) on delete set null,
  notes                      text,
  contributor_id             uuid references auth.users(id) on delete set null,
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now()
);

create index if not exists shop_overrides_closed_idx
  on public.shop_overrides (override_closed_at)
  where override_closed_at is not null;

alter table public.shop_overrides enable row level security;

drop policy if exists "shop_overrides_read_all"     on public.shop_overrides;
drop policy if exists "shop_overrides_insert_auth"  on public.shop_overrides;
drop policy if exists "shop_overrides_update_owner" on public.shop_overrides;

create policy "shop_overrides_read_all" on public.shop_overrides
  for select using (true);

create policy "shop_overrides_insert_auth" on public.shop_overrides
  for insert with check (auth.uid() = contributor_id);

-- For now, owner-only updates. Future: community vote / moderator override.
create policy "shop_overrides_update_owner" on public.shop_overrides
  for update using (auth.uid() = contributor_id);

-- Keep updated_at honest.
create or replace function public.touch_shop_override()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shop_overrides_touch on public.shop_overrides;
create trigger shop_overrides_touch
  before update on public.shop_overrides
  for each row execute function public.touch_shop_override();


-- =============================================================================
-- VERIFY
--   \dt public.*  — should now include flags and shop_overrides
--   select column_name from information_schema.columns where table_name='profiles';
--   → should include username, bio, avatar_url
-- =============================================================================
