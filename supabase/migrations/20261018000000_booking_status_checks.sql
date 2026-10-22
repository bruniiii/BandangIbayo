-- ─────────────────────────────────────────────
-- Allow the online-payment statuses on bookings.
--
-- The bookings table has check constraints listing the allowed
-- payment_status / booking_status values. They were written before online
-- payments, so starting a PayMongo checkout failed with
--   new row for relation "bookings" violates check constraint
--   "bookings_payment_status_check"
-- because 'Awaiting Payment' (and 'Expired') weren't on the list.
--
-- This keeps every value the constraints already allow and adds the ones the
-- system uses now. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  rec  record;
  def  text;
  vals text[];
begin
  for rec in
    select * from (values
      ('payment_status', 'bookings_payment_status_check',
        array['Pending', 'Verification Pending', 'Awaiting Payment', 'Complete', 'Rejected', 'Expired']),
      ('booking_status', 'bookings_booking_status_check',
        array['Active', 'Completed', 'Cancelled', 'Rejected'])
    ) as t(col, con, needed)
  loop
    -- Values the current constraint allows (if there is one), plus the needed ones.
    select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
    where c.conrelid = 'public.bookings'::regclass and c.conname = rec.con;

    if def is null then
      continue;  -- no such constraint: nothing is blocking these values
    end if;

    -- The constraint lists its values either as ARRAY['A'::text, 'B'::text]
    -- (as first created) or as '{A,B}'::text[] (after this script ran once).
    select array_agg(distinct v order by v) into vals
    from (
      select unnest(
        case
          when def ~ '''\{' then substring(def from '''(\{[^'']*\})''')::text[]
          else array(select m[1] from regexp_matches(def, '''([^'']+)''', 'g') as m)
        end
      ) as v
      union
      select unnest(rec.needed)
    ) s;

    execute format('alter table public.bookings drop constraint %I', rec.con);
    execute format(
      'alter table public.bookings add constraint %I check (%I is null or %I = any (%L::text[]))',
      rec.con, rec.col, rec.col, vals
    );
    raise notice '% now allows: %', rec.col, array_to_string(vals, ', ');
  end loop;
end;
$$;
