-- ─────────────────────────────────────────────
-- Seats per van. Each saved van says how many people it carries; Tracking
-- warns when a tour has more slots than the van picked for it.
-- Existing vans start at 14 (the Booking Rules "Seats per van").
-- ─────────────────────────────────────────────

alter table public.fleet_vans
  add column if not exists seats integer not null default 14;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.fleet_vans'::regclass and conname = 'fleet_vans_seats_check') then
    alter table public.fleet_vans add constraint fleet_vans_seats_check check (seats between 1 and 100);
  end if;
end $$;
