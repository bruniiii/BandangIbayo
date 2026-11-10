-- ─────────────────────────────────────────────
-- Ratings per inclusion
--
-- After a trip, a joiner who checked in (QR check-in) can rate each part of
-- it (1 to 5 stars), seeing only the inclusion names. The ratings are kept
-- against the supplier, so averages build up across tours and show on the
-- supplier checklist and the Suppliers page. The overall review is unchanged.
--   • A joiner rates each part once, only their own, only for tours they
--     checked in to that have ended (rate_inclusions checks all of it).
--   • Joiners never read suppliers, rates or other people's ratings.
--
-- Run after 20261225000000_actual_expenses.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.inclusion_ratings (
      id uuid primary key default gen_random_uuid(),
      tour_id %s not null references public.tours(id) on delete cascade,
      line_id uuid references public.tour_expense_lines(id) on delete set null,
      supplier_id uuid not null references public.suppliers(id) on delete restrict,
      user_id uuid not null default auth.uid(),
      rating smallint not null check (rating between 1 and 5),
      created_at timestamptz not null default now(),
      unique (user_id, tour_id, supplier_id)
    )$f$, tour_id_type);
end;
$$;
create index if not exists inclusion_ratings_supplier_idx on public.inclusion_ratings (supplier_id);

alter table public.inclusion_ratings enable row level security;
revoke all on public.inclusion_ratings from anon, authenticated;
grant select on public.inclusion_ratings to authenticated;
drop policy if exists "inclusion_ratings_read" on public.inclusion_ratings;
create policy "inclusion_ratings_read" on public.inclusion_ratings
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: joiners rate through rate_inclusions()
-- (once per part), and no one edits or removes a rating.

-- Did this joiner check in to this tour (and has it ended)?
create or replace function public.checked_in_on_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
     where b.tour_id = p_tour_id and b.user_id = auth.uid()
       and b.checked_in_at is not null
       and b.booking_status not in ('Cancelled', 'Rejected')
  ) and public.tour_has_ended(p_tour_id)
$$;
revoke all on function public.checked_in_on_tour from public;
grant execute on function public.checked_in_on_tour to authenticated;

-- The parts of a tour a joiner can rate: names only (one per supplier),
-- with their own rating if they already gave one.
create or replace function public.my_rateable_inclusions(p_tour_id public.tours.id%type)
returns table (line_id uuid, label text, my_rating smallint)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (l.supplier_id) l.id, l.label,
         (select r.rating from public.inclusion_ratings r
           where r.user_id = auth.uid() and r.tour_id = p_tour_id and r.supplier_id = l.supplier_id)
    from public.tour_expense_lines l
   where l.tour_id = p_tour_id and l.supplier_id is not null and not l.is_unplanned
     and public.checked_in_on_tour(p_tour_id)
   order by l.supplier_id, l.sort_order
$$;
revoke all on function public.my_rateable_inclusions from public;
grant execute on function public.my_rateable_inclusions to authenticated;

-- p_ratings: [{ line_id, rating }]. Parts already rated are skipped.
create or replace function public.rate_inclusions(p_tour_id public.tours.id%type, p_ratings jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_supplier uuid;
  v_rating integer;
  v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if not public.checked_in_on_tour(p_tour_id) then
    raise exception 'You can rate the parts of a trip you checked in to, once it has ended.';
  end if;
  if jsonb_typeof(coalesce(p_ratings, '[]'::jsonb)) <> 'array' then raise exception 'The ratings are not valid.'; end if;
  for v in select * from jsonb_array_elements(p_ratings) loop
    v_rating := (v ->> 'rating')::int;
    if v_rating is null or v_rating not between 1 and 5 then raise exception 'Each rating must be 1 to 5 stars.'; end if;
    select supplier_id into v_supplier from public.tour_expense_lines
     where id = nullif(v ->> 'line_id', '')::uuid and tour_id = p_tour_id and supplier_id is not null and not is_unplanned;
    if v_supplier is null then raise exception 'That part isn''t on this trip.'; end if;
    insert into public.inclusion_ratings (tour_id, line_id, supplier_id, user_id, rating)
    values (p_tour_id, nullif(v ->> 'line_id', '')::uuid, v_supplier, auth.uid(), v_rating)
    on conflict (user_id, tour_id, supplier_id) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.rate_inclusions from public;
grant execute on function public.rate_inclusions to authenticated;

-- Average rating per supplier (admins).
create or replace function public.supplier_rating_summary()
returns table (supplier_id uuid, avg_rating numeric, ratings integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.supplier_id, round(avg(r.rating)::numeric, 2), count(*)::int
    from public.inclusion_ratings r
   where public.is_admin()
   group by r.supplier_id
$$;
revoke all on function public.supplier_rating_summary from public;
grant execute on function public.supplier_rating_summary to authenticated;
