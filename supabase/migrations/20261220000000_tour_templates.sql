-- ─────────────────────────────────────────────
-- Tour templates: a pre-made tour for each place (e.g. "Baguio")
--
-- Holds everything a tour can have (photos, details, rates, pickup points,
-- accommodation, lists, itinerary, expenses). When creating a tour, the admin
-- picks a template and ticks what to use from it. Admins only.
--
-- Run after 20261219000000_admin_tools.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.tour_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 80),
  data       jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tour_templates_name_unique on public.tour_templates (lower(btrim(name)));

alter table public.tour_templates enable row level security;
drop policy if exists "tour_templates_admin" on public.tour_templates;
create policy "tour_templates_admin" on public.tour_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.tour_templates to authenticated;

-- (Changes to templates show in System Maintenance → Admin activity.)
do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists tour_templates_admin_activity on public.tour_templates;
    create trigger tour_templates_admin_activity after insert or update or delete on public.tour_templates
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;
