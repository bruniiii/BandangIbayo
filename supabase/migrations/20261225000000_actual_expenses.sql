-- ─────────────────────────────────────────────
-- Actual expenses after a tour
--
-- When a tour has ended, admins enter what was really paid for each expense
-- line (next to the estimate), with an optional receipt photo and note, and
-- add unplanned costs. "Mark expenses as final" locks them: after that only
-- the main admin can change them (or reopen them). Every change goes to the
-- activity log (tour_expense_lines and tours are logged).
--
-- Run after 20261224000000_tour_expense_lines.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Receipt photos (private; admins only) ──
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('expense-receipts', 'expense-receipts', false)
    on conflict (id) do nothing;
    drop policy if exists "expense_receipts_admin_read" on storage.objects;
    create policy "expense_receipts_admin_read" on storage.objects
      for select to authenticated using (bucket_id = 'expense-receipts' and public.is_admin());
    drop policy if exists "expense_receipts_admin_upload" on storage.objects;
    create policy "expense_receipts_admin_upload" on storage.objects
      for insert to authenticated with check (bucket_id = 'expense-receipts' and public.is_admin());
    drop policy if exists "expense_receipts_admin_update" on storage.objects;
    create policy "expense_receipts_admin_update" on storage.objects
      for update to authenticated using (bucket_id = 'expense-receipts' and public.is_admin());
  end if;
end;
$$;

-- ── 2. Only the finalize function sets or clears "final" ──
create or replace function public.tours_guard_expenses_final()
returns trigger
language plpgsql
as $$
begin
  if (new.expenses_final_at is distinct from old.expenses_final_at or new.expenses_final_by is distinct from old.expenses_final_by)
     and public.is_client_request()
     and coalesce(current_setting('app.expense_finalize', true), '') <> 'on' then
    raise exception 'Use "Mark expenses as final" to lock a tour''s expenses.';
  end if;
  return new;
end;
$$;
drop trigger if exists tours_guard_expenses_final on public.tours;
create trigger tours_guard_expenses_final before update on public.tours
  for each row execute function public.tours_guard_expenses_final();

-- A tour has ended (Philippine date).
create or replace function public.tour_has_ended(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select coalesce(end_date, start_date) < (now() at time zone 'Asia/Manila')::date
                     from public.tours where id = p_tour_id), false)
$$;

-- ── 3. Saving the actual amounts ──
-- p_lines: [{ id?, label, category, supplier_id?, actual_amount, actual_note?, receipt_path? }]
-- Lines with an id update that line's actual amount, note and receipt;
-- lines without an id are new unplanned costs. Unplanned lines left out
-- are removed (planned lines are never removed here).
create or replace function public.save_actual_expenses(p_tour_id public.tours.id%type, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_amount numeric;
  v_n integer := 0;
  v_category text;
begin
  if not public.is_admin() then raise exception 'Only admins can enter expenses.'; end if;
  if not exists (select 1 from public.tours where id = p_tour_id) then raise exception 'Tour not found.'; end if;
  if not public.tour_has_ended(p_tour_id) then raise exception 'Actual expenses can be entered once the tour has ended.'; end if;
  if (select expenses_final_at from public.tours where id = p_tour_id) is not null and not public.is_main_admin() then
    raise exception 'These expenses are final: only the main admin can change them.';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then raise exception 'The expense lines are not valid.'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    v_amount := case when coalesce(v_line ->> 'actual_amount', '') = '' then null else (v_line ->> 'actual_amount')::numeric end;
    if v_amount is not null and v_amount < 0 then
      raise exception '"%": the actual amount can''t be negative.', coalesce(btrim(v_line ->> 'label'), 'A line');
    end if;
    v_id := nullif(v_line ->> 'id', '')::uuid;
    if v_id is not null then
      update public.tour_expense_lines
         set actual_amount = round(v_amount, 2),
             actual_note = left(nullif(btrim(coalesce(v_line ->> 'actual_note', '')), ''), 500),
             receipt_path = nullif(btrim(coalesce(v_line ->> 'receipt_path', '')), ''),
             label = case when is_unplanned and coalesce(btrim(v_line ->> 'label'), '') <> '' then left(btrim(v_line ->> 'label'), 80) else label end,
             category = case when is_unplanned and coalesce(v_line ->> 'category', '') <> '' and v_line ->> 'category' <> 'bag_tag' then v_line ->> 'category' else category end
       where id = v_id and tour_id = p_tour_id;
      if not found then raise exception 'An expense line doesn''t belong to this tour.'; end if;
    else
      if coalesce(btrim(v_line ->> 'label'), '') = '' then raise exception 'Name each unplanned expense.'; end if;
      if v_amount is null then raise exception '"%": enter the amount paid.', btrim(v_line ->> 'label'); end if;
      v_category := coalesce(nullif(v_line ->> 'category', ''), 'other');
      if v_category = 'bag_tag' then v_category := 'other'; end if;
      insert into public.tour_expense_lines (tour_id, supplier_id, category, label, rate, rate_basis, quantity, is_unplanned,
                                             actual_amount, actual_note, receipt_path, sort_order)
      values (p_tour_id, nullif(v_line ->> 'supplier_id', '')::uuid, v_category, left(btrim(v_line ->> 'label'), 80), 0, 'per_trip', 1, true,
              round(v_amount, 2), left(nullif(btrim(coalesce(v_line ->> 'actual_note', '')), ''), 500),
              nullif(btrim(coalesce(v_line ->> 'receipt_path', '')), ''), 1000 + v_n)
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.tour_expense_lines
   where tour_id = p_tour_id and is_unplanned and not (id = any (v_keep));
  return v_n;
end;
$$;
revoke all on function public.save_actual_expenses from public;
grant execute on function public.save_actual_expenses to authenticated;

-- ── 4. Mark as final (any admin), reopen (main admin) ──
create or replace function public.set_expenses_final(p_tour_id public.tours.id%type, p_final boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  if not public.tour_has_ended(p_tour_id) then raise exception 'The tour hasn''t ended yet.'; end if;
  if p_final then
    if exists (select 1 from public.tour_expense_lines where tour_id = p_tour_id and actual_amount is null) then
      raise exception 'Enter the actual amount of every line first (0 if nothing was paid).';
    end if;
    if not exists (select 1 from public.tour_expense_lines where tour_id = p_tour_id) then
      raise exception 'This tour has no expense lines.';
    end if;
  elsif not public.is_main_admin() then
    raise exception 'Only the main admin can reopen final expenses.';
  end if;
  perform set_config('app.expense_finalize', 'on', true);
  update public.tours
     set expenses_final_at = case when p_final then now() end,
         expenses_final_by = case when p_final then auth.uid() end
   where id = p_tour_id
  returning expenses_final_at into v_at;
  perform set_config('app.expense_finalize', 'off', true);
  return v_at;
end;
$$;
revoke all on function public.set_expenses_final from public;
grant execute on function public.set_expenses_final to authenticated;
