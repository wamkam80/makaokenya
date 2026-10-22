-- =====================================================================
-- TrueHome Kenya – Supabase database setup
-- Run this whole file once in Supabase: SQL Editor → New query → Run.
-- It is safe to run again; it won't delete any data.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROFILES
--    One row per user. Holds the Verified flag.
--    Users can READ profiles but can never change them themselves:
--    only the admin functions below (or you, in the dashboard) can.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  verified    boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public"
  on public.profiles for select
  using (true);

-- Create a profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for anyone who signed up before this script ran
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2. LISTINGS
--    Everyone can read. Signed-in users can add, edit and delete
--    only their own listings.
-- ---------------------------------------------------------------------
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 5 and 80),
  purpose      text not null check (purpose in ('rent', 'sale')),
  type         text not null check (type in ('apartment', 'house', 'bedsitter', 'land', 'commercial')),
  price        integer not null check (price > 0),
  beds         smallint not null default 0 check (beds between 0 and 20),
  baths        smallint not null default 0 check (baths between 0 and 20),
  location     text not null check (char_length(location) <= 60),
  county       text not null check (char_length(county) <= 40),
  lat          double precision not null check (lat between -5 and 5.5),
  lng          double precision not null check (lng between 33.5 and 42.5),
  contact_name text not null check (char_length(contact_name) between 1 and 50),
  role         text not null check (role in ('landlord', 'agent', 'caretaker')),
  phone        text not null check (phone ~ '^254[17][0-9]{8}$'),
  description  text check (char_length(description) <= 1000),
  photo_url    text check (photo_url is null or photo_url like 'https://%'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists listings_created_at_idx on public.listings (created_at desc);
create index if not exists listings_owner_idx on public.listings (owner_id);

alter table public.listings enable row level security;

drop policy if exists "Listings are public" on public.listings;
create policy "Listings are public"
  on public.listings for select
  using (true);

drop policy if exists "Users add own listings" on public.listings;
create policy "Users add own listings"
  on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users edit own listings" on public.listings;
create policy "Users edit own listings"
  on public.listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users delete own listings" on public.listings;
create policy "Users delete own listings"
  on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- What the website reads: each listing plus whether its owner is verified
drop view if exists public.listings_public;
create view public.listings_public
with (security_invoker = true) as
select
  l.*,
  coalesce(p.verified, false) as owner_verified
from public.listings l
left join public.profiles p on p.id = l.owner_id;

grant select on public.listings_public to anon, authenticated;

-- Table access for the website (row-level security above still decides
-- WHICH rows each person can see or change)
grant select on public.profiles to anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;


-- ---------------------------------------------------------------------
-- 3. VERIFICATION REQUESTS
--    Private: each user sees only their own. You review them in the
--    dashboard and approve with public.approve_verification(...).
-- ---------------------------------------------------------------------
create table if not exists public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name     text not null check (char_length(full_name) between 3 and 60),
  id_number     text not null check (id_number ~ '^[0-9]{7,8}$'),
  agent_reg_no  text check (char_length(agent_reg_no) <= 40),
  property_ref  text check (char_length(property_ref) <= 80),
  id_doc_path   text not null,
  deed_doc_path text not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);

-- Only one request under review per person at a time
create unique index if not exists one_pending_request_per_user
  on public.verification_requests (user_id)
  where status = 'pending';

alter table public.verification_requests enable row level security;

drop policy if exists "Users read own requests" on public.verification_requests;
create policy "Users read own requests"
  on public.verification_requests for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users submit own requests" on public.verification_requests;
create policy "Users submit own requests"
  on public.verification_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and review_note is null
    and reviewed_at is null
    and id_doc_path   like (select auth.uid())::text || '/%'
    and deed_doc_path like (select auth.uid())::text || '/%'
  );

drop policy if exists "Users withdraw pending requests" on public.verification_requests;
create policy "Users withdraw pending requests"
  on public.verification_requests for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

grant select, insert, delete on public.verification_requests to authenticated;


-- ---------------------------------------------------------------------
-- 4. ADMIN FUNCTIONS (run these yourself in the SQL Editor)
--    Website visitors cannot call them.
--
--    select public.approve_verification('REQUEST-ID');
--    select public.reject_verification('REQUEST-ID', 'Reason shown to the user');
--    select public.revoke_verification('USER-ID');
-- ---------------------------------------------------------------------
create or replace function public.approve_verification(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  update public.verification_requests
     set status = 'approved', reviewed_at = now(), review_note = null
   where id = request_id and status = 'pending'
  returning user_id into target;

  if target is null then
    raise exception 'No pending request with id %', request_id;
  end if;

  update public.profiles
     set verified = true, verified_at = now()
   where id = target;
end;
$$;

create or replace function public.reject_verification(request_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.verification_requests
     set status = 'rejected', reviewed_at = now(), review_note = reason
   where id = request_id and status = 'pending';

  if not found then
    raise exception 'No pending request with id %', request_id;
  end if;
end;
$$;

create or replace function public.revoke_verification(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set verified = false, verified_at = null
   where id = target_user;
end;
$$;

revoke execute on function public.approve_verification(uuid)      from public, anon, authenticated;
revoke execute on function public.reject_verification(uuid, text) from public, anon, authenticated;
revoke execute on function public.revoke_verification(uuid)       from public, anon, authenticated;
revoke execute on function public.handle_new_user()               from public, anon, authenticated;

-- Nobody can change profiles (the Verified flag) through the website
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.listings from anon;
revoke insert, update, delete, truncate on public.verification_requests from anon;
revoke update, truncate on public.verification_requests from authenticated;


-- ---------------------------------------------------------------------
-- 5. FILE STORAGE
--    listing-photos:    public (anyone can view photos)
--    verification-docs: PRIVATE (only you, in the dashboard, can open them)
--    Users can only upload into a folder named after their own user id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos', 'listing-photos', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Users upload own listing photos" on storage.objects;
create policy "Users upload own listing photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own listing photos" on storage.objects;
create policy "Users delete own listing photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users upload own verification docs" on storage.objects;
create policy "Users upload own verification docs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own verification docs" on storage.objects;
create policy "Users delete own verification docs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Users can see (and therefore delete) files in their own folders
drop policy if exists "Users read own files" on storage.objects;
create policy "Users read own files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('listing-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
