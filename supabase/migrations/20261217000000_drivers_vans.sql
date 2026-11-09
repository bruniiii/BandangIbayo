-- ─────────────────────────────────────────────
-- Saved drivers and vans (Tracking Management)
--
-- Admins save each driver (name, number, license/ID and photo) and each van
-- (model, plate, color, how to spot it) once, then just pick a driver and a
-- van for a tour. Only admins can see or change these lists; the driver's ID
-- and photo stay in the private "driver-docs" bucket.
--
-- Run after 20261216000000_documentation_feedback.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.fleet_drivers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) >= 2),
  contact      text not null,
  license_path text,
  photo_path   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.fleet_vans (
  id           uuid primary key default gen_random_uuid(),
  car_type     text not null check (length(btrim(car_type)) >= 2),
  plate_number text not null,
  color        text not null,
  notes        text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists fleet_vans_plate_unique on public.fleet_vans (upper(plate_number)) where is_active;

alter table public.fleet_drivers enable row level security;
alter table public.fleet_vans enable row level security;
drop policy if exists "fleet_drivers_admin" on public.fleet_drivers;
create policy "fleet_drivers_admin" on public.fleet_drivers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "fleet_vans_admin" on public.fleet_vans;
create policy "fleet_vans_admin" on public.fleet_vans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.fleet_drivers, public.fleet_vans to authenticated;

-- Which saved driver and van a tour uses (the details are still copied onto
-- tour_vehicles, which the tour's joiners read).
alter table public.tour_vehicles add column if not exists driver_id uuid references public.fleet_drivers (id) on delete set null;
alter table public.tour_vehicles add column if not exists van_id uuid references public.fleet_vans (id) on delete set null;
