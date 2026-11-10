-- ─────────────────────────────────────────────
-- Suppliers (System Maintenance → Suppliers)
--
-- The agency's regular suppliers, saved once: van rentals, tour guides, boat
-- operators, accommodations, attractions and food. Tours are built by ticking
-- them (tour_expense_lines, next update).
--   • Admins only: joiners never read this table (contacts and rates).
--   • Never deleted: archived and restored. A supplier an upcoming tour uses
--     can't be archived (the database says which tour).
--   • Names are unique (ignoring capitals and spaces), phone numbers are
--     Philippine numbers, rates are ₱0 or more.
--   • Every change goes to the activity log.
--
-- Run after 20261222000000_booking_rules.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_type text not null,
  inclusion_name text not null,
  contact_person text,
  contact_number text,
  destinations text[] not null default '{}',
  default_rate numeric(12,2) not null default 0,
  rate_basis text not null default 'per_trip',
  notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_type_check check (supplier_type in ('van_rental', 'tour_guide', 'boat', 'accommodation', 'attraction', 'food', 'other')),
  constraint suppliers_basis_check check (rate_basis in ('per_person', 'per_trip')),
  constraint suppliers_rate_check check (default_rate >= 0 and default_rate <= 10000000),
  constraint suppliers_name_check check (length(btrim(name)) between 2 and 120),
  constraint suppliers_inclusion_check check (length(btrim(inclusion_name)) between 2 and 80),
  constraint suppliers_phone_check check (
    contact_number is null or contact_number ~ '^(09\d{9}|0[2-8]\d{8})$'),
  constraint suppliers_text_check check (
    coalesce(length(contact_person), 0) <= 120 and coalesce(length(notes), 0) <= 1000)
);

create unique index if not exists suppliers_name_unique
  on public.suppliers (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
create index if not exists suppliers_type_idx on public.suppliers (supplier_type, is_active);

-- Tidy before saving: trimmed text, phone as 09XXXXXXXXX, destinations
-- trimmed and without repeats, archived_at kept in step with is_active.
create or replace function public.suppliers_tidy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_phone text;
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.inclusion_name := regexp_replace(btrim(new.inclusion_name), '\s+', ' ', 'g');
  new.contact_person := nullif(btrim(coalesce(new.contact_person, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  v_phone := nullif(regexp_replace(coalesce(new.contact_number, ''), '[\s\-().]', '', 'g'), '');
  if v_phone like '+63%' then v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^63\d{10}$' then v_phone := '0' || substr(v_phone, 3);
  end if;
  new.contact_number := v_phone;
  new.destinations := coalesce((
    select array_agg(d order by o)
      from (select distinct on (lower(d)) d, o
              from (select regexp_replace(btrim(x), '\s+', ' ', 'g') as d, ord as o
                      from unnest(coalesce(new.destinations, '{}')) with ordinality as u(x, ord)
                     where btrim(coalesce(x, '')) <> '') a
             order by lower(d), o) b
  ), '{}');
  if cardinality(new.destinations) = 0 then
    raise exception 'Add at least one destination this supplier serves.';
  end if;
  if exists (select 1 from unnest(new.destinations) d where length(d) > 120) then
    raise exception 'A destination can be at most 120 characters.';
  end if;
  if exists (select 1 from public.suppliers s
              where s.id <> new.id
                and lower(s.name) = lower(new.name)) then
    raise exception 'A supplier named "%" is already saved.', new.name;
  end if;
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  elsif tg_op = 'INSERT' and not new.is_active then
    new.archived_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists suppliers_tidy on public.suppliers;
create trigger suppliers_tidy before insert or update on public.suppliers
  for each row execute function public.suppliers_tidy();

-- Never deleted (past tours keep pointing to them).
create or replace function public.suppliers_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Suppliers can''t be deleted. Archive it instead (it can be restored).';
end;
$$;
drop trigger if exists suppliers_no_delete on public.suppliers;
create trigger suppliers_no_delete before delete on public.suppliers
  for each row execute function public.suppliers_no_delete();

-- The upcoming tours (not ended, not archived) that use a supplier.
-- (tour_expense_lines comes with the next update; until then, none.)
create or replace function public.supplier_upcoming_tours(p_supplier_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text[];
begin
  if to_regclass('public.tour_expense_lines') is null then
    return '{}';
  end if;
  execute $q$
    select coalesce(array_agg(distinct t.title || ' (' || to_char(t.start_date, 'Mon FMDD, YYYY') || ')'), '{}')
      from public.tour_expense_lines l
      join public.tours t on t.id = l.tour_id
     where l.supplier_id = $1
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
       and not coalesce(t.is_archived, false)
       and coalesce(t.weather_status, '') <> 'cancelled'
  $q$ into v using p_supplier_id;
  return v;
end;
$$;
revoke all on function public.supplier_upcoming_tours(uuid) from public;
grant execute on function public.supplier_upcoming_tours(uuid) to authenticated;

create or replace function public.suppliers_guard_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
begin
  if old.is_active and not new.is_active then
    v_tours := public.supplier_upcoming_tours(old.id);
    if cardinality(v_tours) > 0 then
      raise exception '% can''t be archived: it''s used by upcoming tour%: %. Remove it from %, or wait until % over.',
        old.name, case when cardinality(v_tours) = 1 then '' else 's' end, array_to_string(v_tours, ', '),
        case when cardinality(v_tours) = 1 then 'that tour' else 'those tours' end,
        case when cardinality(v_tours) = 1 then 'it''s' else 'they''re' end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists suppliers_guard_archive on public.suppliers;
create trigger suppliers_guard_archive before update on public.suppliers
  for each row execute function public.suppliers_guard_archive();

-- ── Who can do what: admins only ──
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;

drop policy if exists "suppliers_admin_read" on public.suppliers;
create policy "suppliers_admin_read" on public.suppliers
  for select to authenticated using (public.is_admin());
drop policy if exists "suppliers_admin_insert" on public.suppliers;
create policy "suppliers_admin_insert" on public.suppliers
  for insert to authenticated with check (public.is_admin());
drop policy if exists "suppliers_admin_update" on public.suppliers;
create policy "suppliers_admin_update" on public.suppliers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Activity log.
do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists suppliers_admin_activity on public.suppliers;
    create trigger suppliers_admin_activity after insert or update or delete on public.suppliers
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;
