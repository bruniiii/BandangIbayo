-- ─────────────────────────────────────────────
-- Favorites: joiners star tours on Explore Tours to book later.
-- Each joiner only sees and changes their own favorites.
--
-- Run after 20261122000000_deactivate_account.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.tour_favorites (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tour_id    bigint not null references public.tours(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tour_id)
);

alter table public.tour_favorites enable row level security;

drop policy if exists "Joiners see their own favorites" on public.tour_favorites;
create policy "Joiners see their own favorites"
  on public.tour_favorites for select using (user_id = auth.uid());

drop policy if exists "Joiners add their own favorites" on public.tour_favorites;
create policy "Joiners add their own favorites"
  on public.tour_favorites for insert with check (user_id = auth.uid());

drop policy if exists "Joiners remove their own favorites" on public.tour_favorites;
create policy "Joiners remove their own favorites"
  on public.tour_favorites for delete using (user_id = auth.uid());

grant select, insert, delete on public.tour_favorites to authenticated;
