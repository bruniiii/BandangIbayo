-- ─────────────────────────────────────────────
-- Destinations (System Maintenance → Destinations)
--
-- One saved list of destinations (name and region), so tours and suppliers
-- use the same names and the supplier checklist and Reports match them.
--   • Filled in from the destinations already used by tours and suppliers.
--   • Everyone can read the active ones (the request forms suggest them);
--     admins add, edit, archive and restore. Never deleted.
--   • A destination an upcoming tour goes to can't be archived.
--   • Names are unique (ignoring capitals and spaces).
--
-- Run after 20261229000000_terms_acceptance.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  region text check (coalesce(length(region), 0) <= 80),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists destinations_name_unique on public.destinations (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

alter table public.destinations enable row level security;
revoke all on public.destinations from anon, authenticated;
grant select on public.destinations to anon, authenticated;
grant insert, update on public.destinations to authenticated;
drop policy if exists "destinations_read" on public.destinations;
create policy "destinations_read" on public.destinations
  for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "destinations_admin_insert" on public.destinations;
create policy "destinations_admin_insert" on public.destinations
  for insert to authenticated with check (public.is_admin());
drop policy if exists "destinations_admin_update" on public.destinations;
create policy "destinations_admin_update" on public.destinations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists destinations_no_delete on public.destinations;
create trigger destinations_no_delete before delete on public.destinations
  for each row execute function public.no_hard_delete();

create or replace function public.destinations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.region := nullif(btrim(coalesce(new.region, '')), '');
  if exists (select 1 from public.destinations d where d.id <> new.id and lower(d.name) = lower(new.name)) then
    raise exception '"%" is already in the list.', new.name;
  end if;
  if tg_op = 'UPDATE' and old.is_active and not new.is_active then
    select coalesce(array_agg(distinct t.title || ' (' || to_char(t.start_date, 'Mon FMDD, YYYY') || ')'), '{}') into v_tours
      from public.tours t
     where lower(btrim(t.destination)) = lower(old.name)
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
       and not coalesce(t.is_archived, false)
       and coalesce(t.weather_status, '') <> 'cancelled';
    if cardinality(v_tours) > 0 then
      raise exception '% can''t be archived: upcoming tour% go% there: %.', old.name,
        case when cardinality(v_tours) = 1 then '' else 's' end, case when cardinality(v_tours) = 1 then 'es' else '' end,
        array_to_string(v_tours, ', ');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists destinations_guard on public.destinations;
create trigger destinations_guard before insert or update on public.destinations
  for each row execute function public.destinations_guard();

do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists destinations_admin_activity on public.destinations;
    create trigger destinations_admin_activity after insert or update or delete on public.destinations
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;

-- The destinations already in use.
insert into public.destinations (name)
select distinct on (lower(n)) n
  from (
    select regexp_replace(btrim(destination), '\s+', ' ', 'g') as n from public.tours where btrim(coalesce(destination, '')) <> ''
    union all
    select regexp_replace(btrim(d), '\s+', ' ', 'g') from public.suppliers, unnest(destinations) d where btrim(coalesce(d, '')) <> ''
  ) x
 where length(n) between 2 and 120
   and not exists (select 1 from public.destinations e where lower(e.name) = lower(x.n))
 order by lower(n), n;
