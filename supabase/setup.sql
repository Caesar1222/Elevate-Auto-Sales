-- =============================================================================
-- Elevate Auto Sales: database setup for the manager page
--
-- Run this once in Supabase: SQL Editor > New query > paste this whole file >
-- Run. It's safe to run again; it only creates what's missing and resets the
-- rules below to these versions.
--
-- What it sets up:
--   1. admins: the logins allowed to manage cars (added in step 4)
--   2. vehicles: the cars shown on the site
--   3. vehicle-photos: public photo storage only admins can change
--   Shoppers can read cars that aren't sold. Only admins can add, edit, or
--   delete cars and photos, even if someone else manages to create a login.
-- =============================================================================

-- 1. Who can manage the inventory ---------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
-- Row level security with no policies: nobody can read or change this table
-- through the website. Manage it here in the SQL editor (step 4).
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. The cars --------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  stock_number text not null unique check (stock_number ~ '^[A-Za-z0-9-]{1,20}$'),
  vin text not null check (char_length(vin) between 5 and 17),
  year int not null check (year between 1950 and 2100),
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  trim text not null default '',
  body_type text not null default '',
  price int not null check (price between 0 and 10000000),
  mileage int not null check (mileage between 0 and 2000000),
  exterior_color text not null default '',
  interior_color text not null default '',
  transmission text not null default '',
  drivetrain text not null default '',
  engine text not null default '',
  fuel_type text not null default '',
  mpg_city int check (mpg_city between 0 and 200),
  mpg_highway int check (mpg_highway between 0 and 200),
  features text[] not null default '{}',
  description text not null default '' check (char_length(description) <= 4000),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  status text not null default 'available' check (status in ('available', 'pending', 'sold')),
  badge text not null default '',
  date_in_stock date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists vehicles_touch_updated_at on public.vehicles;
create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

alter table public.vehicles enable row level security;
grant select on public.vehicles to anon, authenticated;
grant insert, update, delete on public.vehicles to authenticated;

drop policy if exists "Shoppers see cars that are for sale" on public.vehicles;
create policy "Shoppers see cars that are for sale" on public.vehicles
  for select to anon, authenticated
  using (status <> 'sold' or public.is_admin());

drop policy if exists "Admins add cars" on public.vehicles;
create policy "Admins add cars" on public.vehicles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Admins edit cars" on public.vehicles;
create policy "Admins edit cars" on public.vehicles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete cars" on public.vehicles;
create policy "Admins delete cars" on public.vehicles
  for delete to authenticated
  using (public.is_admin());

-- 3. Photo storage ---------------------------------------------------------------
-- Public bucket: anyone can view a photo by its link. Up to 5 MB per file; the
-- manager page shrinks photos to well under that before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins see vehicle photos" on storage.objects;
create policy "Admins see vehicle photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'vehicle-photos' and public.is_admin());

drop policy if exists "Admins upload vehicle photos" on storage.objects;
create policy "Admins upload vehicle photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vehicle-photos' and public.is_admin());

drop policy if exists "Admins replace vehicle photos" on storage.objects;
create policy "Admins replace vehicle photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'vehicle-photos' and public.is_admin())
  with check (bucket_id = 'vehicle-photos' and public.is_admin());

drop policy if exists "Admins delete vehicle photos" on storage.objects;
create policy "Admins delete vehicle photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-photos' and public.is_admin());

-- 4. Make someone an admin ---------------------------------------------------------
-- First create their login: Authentication > Users > Add user > Create new
-- user (check "Auto Confirm User"). Then put their email below, select just
-- these two lines, and run them:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'their.email@example.com';
--
-- To remove someone:
-- delete from public.admins where user_id = (select id from auth.users where email = 'their.email@example.com');
