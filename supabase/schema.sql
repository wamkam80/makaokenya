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


-- ---------------------------------------------------------------------
-- 6. PUBLIC BADGE CODES
--    Each approved lister gets a code like TH-7KQ2MX and a short public
--    name ("Jane K."). Anyone can check the code on the website at
--    #v/TH-7KQ2MX, so a copied badge image can't fool people.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists public_code text unique,
  add column if not exists public_name text;

create or replace function public.new_public_code()
returns text language plpgsql set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'TH-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where public_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.short_public_name(full_name text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when position(' ' in btrim(full_name)) > 0 then
      initcap(split_part(btrim(full_name), ' ', 1)) || ' ' ||
      upper(left(regexp_replace(btrim(full_name), '^.*\s', ''), 1)) || '.'
    else initcap(btrim(full_name))
  end;
$$;

-- Approval now also assigns the badge code and public name
create or replace function public.approve_verification(request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
  fname text;
begin
  update public.verification_requests
     set status = 'approved', reviewed_at = now(), review_note = null
   where id = request_id and status = 'pending'
  returning user_id, full_name into target, fname;

  if target is null then
    raise exception 'No pending request with id %', request_id;
  end if;

  update public.profiles
     set verified = true,
         verified_at = now(),
         public_code = coalesce(public_code, public.new_public_code()),
         public_name = public.short_public_name(fname)
   where id = target;
end;
$$;

revoke execute on function public.approve_verification(uuid) from public, anon, authenticated;
revoke execute on function public.new_public_code() from public, anon, authenticated;

create or replace view public.listings_public
with (security_invoker = true) as
select
  l.*,
  coalesce(p.verified, false) as owner_verified,
  case when p.verified then p.public_code end as owner_code
from public.listings l
left join public.profiles p on p.id = l.owner_id;

grant select on public.listings_public to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. LISTING REPORTS
--    Anyone can report a listing; only you can read reports
--    (Table Editor → open_reports).
-- ---------------------------------------------------------------------
create table if not exists public.listing_reports (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings (id) on delete cascade,
  reason           text not null check (reason in ('scam', 'not_available', 'wrong_info', 'fake_photos', 'duplicate', 'other')),
  details          text check (char_length(details) <= 500),
  reporter_contact text check (char_length(reporter_contact) <= 100),
  reporter_id      uuid default auth.uid(),
  status           text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at       timestamptz not null default now()
);

create index if not exists listing_reports_listing_idx on public.listing_reports (listing_id);
create index if not exists listing_reports_open_idx on public.listing_reports (created_at desc) where status = 'open';

alter table public.listing_reports enable row level security;

drop policy if exists "Anyone can report a listing" on public.listing_reports;
create policy "Anyone can report a listing"
  on public.listing_reports for insert to anon, authenticated
  with check (
    status = 'open'
    and (reporter_id is null or reporter_id = (select auth.uid()))
  );

grant insert on public.listing_reports to anon, authenticated;
revoke select, update, delete, truncate on public.listing_reports from anon, authenticated;

create or replace view public.open_reports
with (security_invoker = true) as
select
  r.id as report_id,
  r.created_at,
  r.reason,
  r.details,
  r.reporter_contact,
  l.id as listing_id,
  l.title,
  l.location,
  l.phone as listing_phone,
  l.owner_id,
  coalesce(p.verified, false) as owner_verified,
  (select count(*) from public.listing_reports r2 where r2.listing_id = l.id) as total_reports_on_listing
from public.listing_reports r
join public.listings l on l.id = r.listing_id
left join public.profiles p on p.id = l.owner_id
where r.status = 'open'
order by r.created_at desc;

revoke all on public.open_reports from anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. ADMIN PAGE
--    People listed in public.admins can use the website's #admin page.
--    Add an admin:  insert into public.admins (user_id)
--                   select id from auth.users where email = 'you@example.com';
--    Every admin_* function checks is_admin() itself.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "Admins can see their own admin row" on public.admins;
create policy "Admins can see their own admin row"
  on public.admins for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.admins to authenticated;
revoke insert, update, delete, truncate on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins read all requests" on public.verification_requests;
create policy "Admins read all requests"
  on public.verification_requests for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins read verification docs" on storage.objects;
create policy "Admins read verification docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and (select public.is_admin()));

drop policy if exists "Admins read reports" on public.listing_reports;
create policy "Admins read reports"
  on public.listing_reports for select to authenticated
  using ((select public.is_admin()));
grant select on public.listing_reports to authenticated;
grant select on public.open_reports to authenticated;

drop policy if exists "Admins delete any listing" on public.listings;
create policy "Admins delete any listing"
  on public.listings for delete to authenticated
  using ((select public.is_admin()));
drop policy if exists "Admins delete any listing photo" on storage.objects;
create policy "Admins delete any listing photo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (select public.is_admin()));

create or replace function public.admin_approve(request_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare code text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.approve_verification(request_id);
  select p.public_code into code
    from public.profiles p
    join public.verification_requests r on r.user_id = p.id
   where r.id = request_id;
  return code;
end;
$$;

create or replace function public.admin_reject(request_id uuid, reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.reject_verification(request_id, reason);
end;
$$;

create or replace function public.admin_revoke(target_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.revoke_verification(target_user);
end;
$$;

create or replace function public.admin_set_report_status(report_id uuid, new_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if new_status not in ('open', 'reviewed', 'actioned') then raise exception 'Bad status'; end if;
  update public.listing_reports set status = new_status where id = report_id;
end;
$$;

create or replace function public.admin_verified_listers()
returns table (user_id uuid, public_name text, public_code text, verified_at timestamptz, listings bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select p.id, p.public_name, p.public_code, p.verified_at,
           (select count(*) from public.listings l where l.owner_id = p.id)
      from public.profiles p
     where p.verified
     order by p.verified_at desc;
end;
$$;

revoke execute on function public.admin_approve(uuid)                 from public, anon;
revoke execute on function public.admin_reject(uuid, text)            from public, anon;
revoke execute on function public.admin_revoke(uuid)                  from public, anon;
revoke execute on function public.admin_set_report_status(uuid, text) from public, anon;
revoke execute on function public.admin_verified_listers()            from public, anon;
grant execute on function public.admin_approve(uuid)                 to authenticated;
grant execute on function public.admin_reject(uuid, text)            to authenticated;
grant execute on function public.admin_revoke(uuid)                  to authenticated;
grant execute on function public.admin_set_report_status(uuid, text) to authenticated;
grant execute on function public.admin_verified_listers()            to authenticated;


-- ---------------------------------------------------------------------
-- 9. BANNED USERS
--    Admins ban scammers from the #admin page. A banned person can't
--    post or edit listings, upload files or ask for verification, their
--    listings disappear from the site, and the phone numbers they used
--    can't be used in new listings.
-- ---------------------------------------------------------------------
create table if not exists public.banned_users (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  reason    text not null check (char_length(reason) between 1 and 300),
  phones    text[] not null default '{}',
  banned_at timestamptz not null default now(),
  banned_by uuid references auth.users (id) on delete set null,
  lifted_at timestamptz            -- set when an admin lifts the ban
);
alter table public.banned_users add column if not exists lifted_at timestamptz;
alter table public.banned_users enable row level security;
drop policy if exists "Users see their own ban" on public.banned_users;
create policy "Users see their own ban"
  on public.banned_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.banned_users to authenticated;
revoke insert, update, delete, truncate on public.banned_users from anon, authenticated;

create or replace function public.is_banned(target uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.banned_users where user_id = target and lifted_at is null);
$$;

create or replace function public.phone_banned(p text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.banned_users where p = any (phones) and lifted_at is null);
$$;
grant execute on function public.is_banned(uuid)  to anon, authenticated;
grant execute on function public.phone_banned(text) to authenticated;

drop policy if exists "Banned users can't add listings" on public.listings;
create policy "Banned users can't add listings"
  on public.listings as restrictive for insert to authenticated
  with check (not public.is_banned((select auth.uid())) and not public.phone_banned(phone));

drop policy if exists "Banned users can't edit listings" on public.listings;
create policy "Banned users can't edit listings"
  on public.listings as restrictive for update to authenticated
  with check (not public.is_banned((select auth.uid())) and not public.phone_banned(phone));

drop policy if exists "Banned users can't request verification" on public.verification_requests;
create policy "Banned users can't request verification"
  on public.verification_requests as restrictive for insert to authenticated
  with check (not public.is_banned((select auth.uid())));

drop policy if exists "Banned users can't upload" on storage.objects;
create policy "Banned users can't upload"
  on storage.objects as restrictive for insert to authenticated
  with check (not public.is_banned((select auth.uid())));


-- ---------------------------------------------------------------------
-- 10. LISTING VIEW COUNTS
--     A simple counter per listing (no personal data). Shown to owners
--     under My listings and to admins.
-- ---------------------------------------------------------------------
create table if not exists public.listing_views (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  views      bigint not null default 0
);
alter table public.listing_views enable row level security;
drop policy if exists "View counts are public" on public.listing_views;
create policy "View counts are public"
  on public.listing_views for select using (true);
grant select on public.listing_views to anon, authenticated;
revoke insert, update, delete, truncate on public.listing_views from anon, authenticated;

create or replace function public.record_view(lid uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.listing_views (listing_id, views)
  select id, 1 from public.listings where id = lid
  on conflict (listing_id) do update set views = public.listing_views.views + 1;
$$;
revoke execute on function public.record_view(uuid) from public;
grant execute on function public.record_view(uuid) to anon, authenticated;

-- Listings shown on the site: hide banned owners, add view counts
create or replace view public.listings_public
with (security_invoker = true) as
select
  l.*,
  coalesce(p.verified, false) as owner_verified,
  case when p.verified then p.public_code end as owner_code,
  coalesce(v.views, 0) as views
from public.listings l
left join public.profiles p on p.id = l.owner_id
left join public.listing_views v on v.listing_id = l.id
where not public.is_banned(l.owner_id);

grant select on public.listings_public to anon, authenticated;


-- Admin functions for bans
create or replace function public.admin_ban(target_user uuid, reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.admins where user_id = target_user) then
    raise exception 'You can''t ban an admin';
  end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Please give a reason'; end if;

  insert into public.banned_users (user_id, reason, phones, banned_by)
  values (
    target_user, trim(reason),
    coalesce((select array_agg(distinct phone) from public.listings where owner_id = target_user), '{}'),
    auth.uid()
  )
  on conflict (user_id) do update
    set reason = excluded.reason, phones = excluded.phones, banned_at = now(),
        banned_by = excluded.banned_by, lifted_at = null;

  if exists (select 1 from public.profiles where id = target_user and verified) then
    perform public.revoke_verification(target_user);
  end if;
  update public.verification_requests
     set status = 'rejected', review_note = 'Account suspended', reviewed_at = now()
   where user_id = target_user and status = 'pending';
  update public.listing_reports set status = 'actioned'
   where status = 'open'
     and listing_id in (select id from public.listings where owner_id = target_user);
end;
$$;

create or replace function public.admin_unban(target_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  update public.banned_users set lifted_at = now() where user_id = target_user and lifted_at is null;
end;
$$;

create or replace function public.admin_banned_users()
returns table (user_id uuid, email text, reason text, phones text[], banned_at timestamptz, listings bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select b.user_id, u.email::text, b.reason, b.phones, b.banned_at,
           (select count(*) from public.listings l where l.owner_id = b.user_id)
      from public.banned_users b
      left join auth.users u on u.id = b.user_id
     where b.lifted_at is null
     order by b.banned_at desc;
end;
$$;

revoke execute on function public.admin_ban(uuid, text)   from public, anon;
revoke execute on function public.admin_unban(uuid)       from public, anon;
revoke execute on function public.admin_banned_users()    from public, anon;
grant execute on function public.admin_ban(uuid, text)   to authenticated;
grant execute on function public.admin_unban(uuid)       to authenticated;
grant execute on function public.admin_banned_users()    to authenticated;
