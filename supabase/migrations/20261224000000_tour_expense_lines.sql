-- ─────────────────────────────────────────────
-- Tour expense lines (the supplier checklist)
--
-- A tour's costs are now a list of lines instead of fixed boxes (Van Rent,
-- Tour Guide, Bag Tag, others). Each line is a ticked supplier or a one-off
-- cost (toll fees, fuel…) with its own rate, saved on the line, so a later
-- change to a supplier's default rate never changes a past tour.
--   • Admins only. Joiners get the names only (tour_inclusion_names), the
--     same names they saw before; they can no longer read any amount.
--   • The Bag Tag stays as it is: on every tour, fixed at the usual fee.
--   • The Van Rent and Tour Guide limits stay (₱15,000–30,000 and
--     ₱1,300–2,000 per line, from the booking rules table); they're no
--     longer on the Booking Rules page.
--   • Every saved tour_expenses row becomes lines here (one-off lines), so no
--     past data is lost and past reports add up the same. The old table
--     stays as a backup (admins only).
--   • Private tour packages keep only the names for the joiner
--     (package_details.covered); the amounts move to an admin-only table.
--
-- Run after 20261223000000_suppliers.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. The lines ──
do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_expense_lines (
      id uuid primary key default gen_random_uuid(),
      tour_id %s not null references public.tours(id) on delete cascade,
      supplier_id uuid references public.suppliers(id) on delete restrict,
      category text not null default 'other',
      label text not null,
      rate numeric(12,2) not null default 0,
      rate_basis text not null default 'per_trip',
      quantity integer not null default 1,
      estimated_amount numeric(12,2) not null default 0,
      is_unplanned boolean not null default false,
      actual_amount numeric(12,2),
      actual_note text,
      receipt_path text,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint tour_expense_lines_category_check check (category in
        ('van_rental', 'tour_guide', 'boat', 'accommodation', 'attraction', 'food', 'other', 'bag_tag')),
      constraint tour_expense_lines_basis_check check (rate_basis in ('per_person', 'per_trip')),
      constraint tour_expense_lines_amounts_check check (
        rate >= 0 and estimated_amount >= 0 and quantity >= 0 and (actual_amount is null or actual_amount >= 0)
        and rate <= 10000000 and estimated_amount <= 100000000 and coalesce(actual_amount, 0) <= 100000000),
      constraint tour_expense_lines_label_check check (length(btrim(label)) between 1 and 80),
      constraint tour_expense_lines_note_check check (coalesce(length(actual_note), 0) <= 500)
    )$f$, tour_id_type);
end;
$$;
create index if not exists tour_expense_lines_tour_idx on public.tour_expense_lines (tour_id, sort_order);
create index if not exists tour_expense_lines_supplier_idx on public.tour_expense_lines (supplier_id);

-- Finished tours: actual expenses can be marked final (next update uses it).
alter table public.tours add column if not exists expenses_final_at timestamptz;
alter table public.tours add column if not exists expenses_final_by uuid;

-- ── 2. Checks on every line ──
-- Amount = rate × quantity (quantity = joiners for per-person lines, 1 per trip).
-- Van Rent and Tour Guide limits per planned line; the Bag Tag is the fixed fee.
create or replace function public.tour_expense_lines_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.label := regexp_replace(btrim(new.label), '\s+', ' ', 'g');
  new.actual_note := nullif(btrim(coalesce(new.actual_note, '')), '');
  if new.rate_basis = 'per_trip' then new.quantity := 1; end if;
  new.estimated_amount := round(new.rate * new.quantity, 2);
  new.updated_at := now();
  if coalesce(current_setting('app.expense_backfill', true), '') = 'on' then
    return new;
  end if;
  if not new.is_unplanned and (tg_op = 'INSERT' or new.estimated_amount is distinct from old.estimated_amount or new.category is distinct from old.category) then
    if new.category = 'van_rental' and new.estimated_amount not between public.rule_num('van_rent_min') and public.rule_num('van_rent_max') then
      raise exception 'Van rental "%" is ₱%: van rent must be from ₱% to ₱% per line.', new.label,
        to_char(new.estimated_amount, 'FM999,999,990.00'), public.rule_money('van_rent_min'), public.rule_money('van_rent_max');
    end if;
    if new.category = 'tour_guide' and new.estimated_amount not between public.rule_num('tour_guide_min') and public.rule_num('tour_guide_max') then
      raise exception 'Tour guide "%" is ₱%: a tour guide must be from ₱% to ₱% per line.', new.label,
        to_char(new.estimated_amount, 'FM999,999,990.00'), public.rule_money('tour_guide_min'), public.rule_money('tour_guide_max');
    end if;
  end if;
  if new.category = 'bag_tag' and not new.is_unplanned and new.rate <> public.rule_num('bag_tag_fee')
     and (tg_op = 'INSERT' or new.rate is distinct from old.rate) then
    raise exception 'The Bag Tag is fixed at ₱%.', public.rule_money('bag_tag_fee');
  end if;
  return new;
end;
$$;
drop trigger if exists tour_expense_lines_check on public.tour_expense_lines;
create trigger tour_expense_lines_check before insert or update on public.tour_expense_lines
  for each row execute function public.tour_expense_lines_check();

-- Final expenses: only the main admin can change them (the website
-- (anyone else) and the database agree).
create or replace function public.tour_expense_lines_guard_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour public.tour_expense_lines.tour_id%type := coalesce(new.tour_id, old.tour_id);
begin
  if public.is_client_request()
     and (select expenses_final_at from public.tours where id = v_tour) is not null
     and not public.is_main_admin() then
    raise exception 'These expenses are final: only the main admin can change them.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists tour_expense_lines_guard_final on public.tour_expense_lines;
create trigger tour_expense_lines_guard_final before insert or update or delete on public.tour_expense_lines
  for each row execute function public.tour_expense_lines_guard_final();

-- ── 3. Admins only ──
alter table public.tour_expense_lines enable row level security;
revoke all on public.tour_expense_lines from anon, authenticated;
grant select, insert, update, delete on public.tour_expense_lines to authenticated;
drop policy if exists "tour_expense_lines_admin" on public.tour_expense_lines;
create policy "tour_expense_lines_admin" on public.tour_expense_lines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists tour_expense_lines_admin_activity on public.tour_expense_lines;
    create trigger tour_expense_lines_admin_activity after insert or update or delete on public.tour_expense_lines
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;

-- The old table: admins only now (joiners could read the amounts before).
drop policy if exists "tour_expenses_read" on public.tour_expenses;
create policy "tour_expenses_read" on public.tour_expenses
  for select to authenticated using (public.is_admin());

-- ── 4. Move the saved expenses into lines (once per tour) ──
do $$
begin
  perform set_config('app.expense_backfill', 'on', true);
  insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, sort_order)
  select e.tour_id, x.category, x.label, x.amount, 'per_trip', 1, x.ord
    from public.tour_expenses e
    cross join lateral (
      select 'van_rental'::text as category, 'Van Rent'::text as label, e.van_rent as amount, 1 as ord
      union all select 'tour_guide', 'Tour Guide', e.tour_guide, 2
      union all select 'bag_tag', 'Bag Tag', e.bag_tag, 3
      union all select 'other', left(btrim(o ->> 'name'), 80), coalesce((o ->> 'amount')::numeric, 0), 3 + n::int
        from jsonb_array_elements(case when jsonb_typeof(e.others) = 'array' then e.others else '[]'::jsonb end) with ordinality as t(o, n)
       where btrim(coalesce(o ->> 'name', '')) <> ''
    ) x
   where x.amount is not null
     and not exists (select 1 from public.tour_expense_lines l where l.tour_id = e.tour_id);
  perform set_config('app.expense_backfill', 'off', true);
end;
$$;

-- ── 5. Saving a tour's checklist ──
-- p_lines: [{ id?, supplier_id?, category, label, rate, rate_basis, is_unplanned?, sort_order? }]
-- p_people: joiners for per-person lines (the tour's slots, or the private group).
-- Lines not in the list are removed; the Bag Tag is always kept.
create or replace function public.save_tour_expense_lines(
  p_tour_id public.tours.id%type, p_people integer, p_lines jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_n integer := 0;
  v_supplier uuid;
  v_category text;
  v_people integer := greatest(coalesce(p_people, 0), 0);
begin
  if not public.is_admin() then raise exception 'Only admins can change tour expenses.'; end if;
  if not exists (select 1 from public.tours where id = p_tour_id) then raise exception 'Tour not found.'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then raise exception 'The expense lines are not valid.'; end if;
  if v_people > 1000 then raise exception 'The number of joiners looks wrong.'; end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_n := v_n + 1;
    v_supplier := nullif(v_line ->> 'supplier_id', '')::uuid;
    v_category := coalesce(nullif(v_line ->> 'category', ''), 'other');
    if v_supplier is not null then
      select supplier_type into v_category from public.suppliers where id = v_supplier;
      if v_category is null then raise exception 'A ticked supplier no longer exists.'; end if;
    end if;
    if coalesce(btrim(v_line ->> 'label'), '') = '' then raise exception 'Expense line % needs a name.', v_n; end if;
    if (v_line ->> 'rate') is null or (v_line ->> 'rate')::numeric < 0 then
      raise exception '"%" needs a rate of ₱0 or more.', btrim(v_line ->> 'label');
    end if;
    v_id := nullif(v_line ->> 'id', '')::uuid;
    if v_id is not null and exists (select 1 from public.tour_expense_lines where id = v_id and tour_id = p_tour_id) then
      update public.tour_expense_lines
         set supplier_id = v_supplier, category = v_category, label = left(btrim(v_line ->> 'label'), 80),
             rate = round((v_line ->> 'rate')::numeric, 2),
             rate_basis = coalesce(nullif(v_line ->> 'rate_basis', ''), 'per_trip'),
             quantity = case when coalesce(v_line ->> 'rate_basis', '') = 'per_person' then v_people else 1 end,
             is_unplanned = coalesce((v_line ->> 'is_unplanned')::boolean, false),
             sort_order = coalesce((v_line ->> 'sort_order')::int, v_n)
       where id = v_id;
    else
      insert into public.tour_expense_lines (tour_id, supplier_id, category, label, rate, rate_basis, quantity, is_unplanned, sort_order)
      values (p_tour_id, v_supplier, v_category, left(btrim(v_line ->> 'label'), 80), round((v_line ->> 'rate')::numeric, 2),
              coalesce(nullif(v_line ->> 'rate_basis', ''), 'per_trip'),
              case when coalesce(v_line ->> 'rate_basis', '') = 'per_person' then v_people else 1 end,
              coalesce((v_line ->> 'is_unplanned')::boolean, false), coalesce((v_line ->> 'sort_order')::int, v_n))
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  delete from public.tour_expense_lines
   where tour_id = p_tour_id and not (id = any (v_ids)) and category <> 'bag_tag';

  -- The Bag Tag, as it is now: on every tour, at the fixed fee.
  if not exists (select 1 from public.tour_expense_lines where tour_id = p_tour_id and category = 'bag_tag') then
    insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, sort_order)
    values (p_tour_id, 'bag_tag', 'Bag Tag', public.rule_num('bag_tag_fee'), 'per_trip', 1, 999);
  end if;
  return (select count(*) from public.tour_expense_lines where tour_id = p_tour_id);
end;
$$;
revoke all on function public.save_tour_expense_lines from public;
grant execute on function public.save_tour_expense_lines to authenticated;

-- ── 6. What joiners see: the names only ──
create or replace function public.tour_inclusion_names(p_tour_id public.tours.id%type)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() or public.has_active_booking_on_tour(p_tour_id) then
    coalesce((select array_agg(label order by sort_order, created_at)
                from public.tour_expense_lines
               where tour_id = p_tour_id and not is_unplanned), '{}')
  else '{}' end
$$;
revoke all on function public.tour_inclusion_names from public;
grant execute on function public.tour_inclusion_names to authenticated;

-- ── 7. Private tour packages: names for the joiner, amounts for admins ──
create table if not exists public.exclusive_package_costs (
  request_id uuid primary key,
  expenses jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.exclusive_package_costs enable row level security;
revoke all on public.exclusive_package_costs from anon, authenticated;
grant select, insert, update on public.exclusive_package_costs to authenticated;
drop policy if exists "exclusive_package_costs_admin" on public.exclusive_package_costs;
create policy "exclusive_package_costs_admin" on public.exclusive_package_costs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare
  r record;
  v_names jsonb;
begin
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.exclusive_requests'::regclass and attname = 'id') <> 'uuid' then
    raise notice 'exclusive_requests.id is not uuid; package amounts left as they are.';
    return;
  end if;
  perform set_config('app.joiner_request_edit', 'on', true);
  for r in
    select id, package_details from public.exclusive_requests
     where jsonb_typeof(package_details -> 'expenses') = 'object'
  loop
    insert into public.exclusive_package_costs (request_id, expenses)
    values (r.id::text::uuid, r.package_details -> 'expenses')
    on conflict (request_id) do nothing;
    v_names := to_jsonb(array_remove(array[
        case when (r.package_details -> 'expenses') ? 'van_rent' then 'Van Rent' end,
        case when (r.package_details -> 'expenses') ? 'tour_guide' then 'Tour Guide' end,
        'Bag Tag'
      ], null))
      || coalesce((select jsonb_agg(btrim(o ->> 'name'))
                     from jsonb_array_elements(case when jsonb_typeof(r.package_details -> 'expenses' -> 'others') = 'array'
                                                    then r.package_details -> 'expenses' -> 'others' else '[]'::jsonb end) o
                    where btrim(coalesce(o ->> 'name', '')) <> ''), '[]'::jsonb);
    update public.exclusive_requests
       set package_details = (package_details - 'expenses') || jsonb_build_object('covered', v_names)
     where id = r.id;
  end loop;
end;
$$;
