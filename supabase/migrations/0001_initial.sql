-- =============================================================================
-- OpenBookMap · Supabase Schema
-- =============================================================================
-- HOW TO USE:
--   1. Open your Supabase project at https://supabase.com/dashboard
--   2. Left sidebar → SQL Editor → New query
--   3. Paste this entire file
--   4. Click "Run"
--   5. Verify: left sidebar → Table Editor should show 5 tables
--
-- WHAT THIS CREATES:
--   - 5 tables: profiles, shops, photos, books, contributions
--   - Row-Level Security policies (public read, authenticated write)
--   - A storage bucket for shelf photos
--   - Indexes for fast search
--
-- RE-RUNNING: Safe. Every statement uses "if not exists" or drops first.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";   -- fuzzy text search for book titles


-- -----------------------------------------------------------------------------
-- 2. PROFILES · extends Supabase's built-in auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  osm_username  text,                    -- optional: link to OSM account later
  created_at    timestamptz default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 3. SHOPS · used bookstores (mirrors OSM data, adds our extras)
-- -----------------------------------------------------------------------------
-- We store a local copy of OSM shops so we can attach photos/books to them
-- without hitting Overpass on every lookup. Shops are auto-created the first
-- time someone uploads content for an OSM ID we haven't seen.
create table if not exists public.shops (
  id             uuid primary key default uuid_generate_v4(),
  osm_type       text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id         bigint not null,
  name           text,
  lat            double precision not null,
  lon            double precision not null,
  city           text,
  country        text,
  website        text,
  book_count     integer default 0,        -- denormalized, updated by trigger
  photo_count    integer default 0,        -- denormalized, updated by trigger
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (osm_type, osm_id)
);

create index if not exists shops_osm_idx on public.shops (osm_type, osm_id);
create index if not exists shops_location_idx on public.shops (lat, lon);


-- -----------------------------------------------------------------------------
-- 4. PHOTOS · shelf photos attached to shops
-- -----------------------------------------------------------------------------
create table if not exists public.photos (
  id             uuid primary key default uuid_generate_v4(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  uploader_id    uuid not null references auth.users(id) on delete set null,
  storage_path   text not null,            -- path in the 'shelf-photos' bucket
  caption        text,
  shelf_label    text,                     -- e.g. "Fiction A-M" (optional)
  license        text not null default 'CC-BY-SA-4.0',
  taken_at       timestamptz,
  created_at     timestamptz default now()
);

create index if not exists photos_shop_idx on public.photos (shop_id);
create index if not exists photos_uploader_idx on public.photos (uploader_id);


-- -----------------------------------------------------------------------------
-- 5. BOOKS · individual titles extracted from photos (via OCR + human review)
-- -----------------------------------------------------------------------------
create table if not exists public.books (
  id             uuid primary key default uuid_generate_v4(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  photo_id       uuid references public.photos(id) on delete set null,
  title          text not null,
  author         text,
  isbn           text,
  raw_ocr_text   text,                     -- what Tesseract saw, for debugging
  confirmed      boolean default false,    -- has a human reviewed it?
  contributor_id uuid references auth.users(id) on delete set null,
  created_at     timestamptz default now()
);

create index if not exists books_shop_idx on public.books (shop_id);
create index if not exists books_title_trgm_idx on public.books using gin (title gin_trgm_ops);
create index if not exists books_author_trgm_idx on public.books using gin (author gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- 6. CONTRIBUTIONS · audit log of who did what, for community trust
-- -----------------------------------------------------------------------------
create table if not exists public.contributions (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  action         text not null,            -- 'upload_photo', 'add_book', 'edit_book'
  target_type    text,                     -- 'shop', 'photo', 'book'
  target_id      uuid,
  created_at     timestamptz default now()
);

create index if not exists contributions_user_idx on public.contributions (user_id);


-- -----------------------------------------------------------------------------
-- 7. COUNTERS · keep book_count and photo_count on shops in sync
-- -----------------------------------------------------------------------------
create or replace function public.bump_shop_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'photos' then
    if tg_op = 'INSERT' then
      update public.shops set photo_count = photo_count + 1, updated_at = now() where id = new.shop_id;
    elsif tg_op = 'DELETE' then
      update public.shops set photo_count = greatest(photo_count - 1, 0), updated_at = now() where id = old.shop_id;
    end if;
  elsif tg_table_name = 'books' then
    if tg_op = 'INSERT' then
      update public.shops set book_count = book_count + 1, updated_at = now() where id = new.shop_id;
    elsif tg_op = 'DELETE' then
      update public.shops set book_count = greatest(book_count - 1, 0), updated_at = now() where id = old.shop_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists photos_count_trigger on public.photos;
create trigger photos_count_trigger
  after insert or delete on public.photos
  for each row execute function public.bump_shop_counts();

drop trigger if exists books_count_trigger on public.books;
create trigger books_count_trigger
  after insert or delete on public.books
  for each row execute function public.bump_shop_counts();


-- =============================================================================
-- 8. ROW LEVEL SECURITY · THE IMPORTANT PART
-- =============================================================================
-- Without these policies the anon key would expose everything. With them,
-- the public can READ bookstore data (good!) but only authenticated users
-- can WRITE — and only their own contributions.
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.shops         enable row level security;
alter table public.photos        enable row level security;
alter table public.books         enable row level security;
alter table public.contributions enable row level security;

-- --- PROFILES ---------------------------------------------------------------
drop policy if exists "profiles_read_all"   on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_read_all" on public.profiles
  for select using (true);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- --- SHOPS ------------------------------------------------------------------
drop policy if exists "shops_read_all"   on public.shops;
drop policy if exists "shops_insert_auth" on public.shops;
drop policy if exists "shops_update_auth" on public.shops;

create policy "shops_read_all" on public.shops
  for select using (true);

create policy "shops_insert_auth" on public.shops
  for insert with check (auth.uid() is not null);

create policy "shops_update_auth" on public.shops
  for update using (auth.uid() is not null);

-- --- PHOTOS -----------------------------------------------------------------
drop policy if exists "photos_read_all"     on public.photos;
drop policy if exists "photos_insert_auth"  on public.photos;
drop policy if exists "photos_delete_own"   on public.photos;

create policy "photos_read_all" on public.photos
  for select using (true);

create policy "photos_insert_auth" on public.photos
  for insert with check (auth.uid() = uploader_id);

create policy "photos_delete_own" on public.photos
  for delete using (auth.uid() = uploader_id);

-- --- BOOKS ------------------------------------------------------------------
drop policy if exists "books_read_all"      on public.books;
drop policy if exists "books_insert_auth"   on public.books;
drop policy if exists "books_update_own"    on public.books;
drop policy if exists "books_delete_own"    on public.books;

create policy "books_read_all" on public.books
  for select using (true);

create policy "books_insert_auth" on public.books
  for insert with check (auth.uid() = contributor_id);

create policy "books_update_own" on public.books
  for update using (auth.uid() = contributor_id);

create policy "books_delete_own" on public.books
  for delete using (auth.uid() = contributor_id);

-- --- CONTRIBUTIONS ----------------------------------------------------------
drop policy if exists "contributions_read_all"    on public.contributions;
drop policy if exists "contributions_insert_own"  on public.contributions;

create policy "contributions_read_all" on public.contributions
  for select using (true);

create policy "contributions_insert_own" on public.contributions
  for insert with check (auth.uid() = user_id);


-- =============================================================================
-- 9. STORAGE BUCKET for shelf photos
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('shelf-photos', 'shelf-photos', true)
on conflict (id) do nothing;

-- Storage policies: anyone can view, only authenticated users can upload
drop policy if exists "shelf_photos_public_read"  on storage.objects;
drop policy if exists "shelf_photos_auth_insert"  on storage.objects;
drop policy if exists "shelf_photos_owner_delete" on storage.objects;

create policy "shelf_photos_public_read" on storage.objects
  for select using (bucket_id = 'shelf-photos');

create policy "shelf_photos_auth_insert" on storage.objects
  for insert with check (
    bucket_id = 'shelf-photos'
    and auth.uid() is not null
  );

create policy "shelf_photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'shelf-photos'
    and auth.uid() = owner
  );


-- =============================================================================
-- DONE. Verify by running:
--   select table_name from information_schema.tables where table_schema = 'public';
-- You should see: profiles, shops, photos, books, contributions
-- =============================================================================
