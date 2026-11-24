-- ═════════════════════════════════════════════
-- 4_fix_lists.sql — FIX FOR DEMO DATA ALREADY IN THE DATABASE
--
-- An older 2_symposium_data.sql gave tours accommodation choices ("Shared
-- room (4 pax)", "Twin room"…) and a difficulty ("Hard") that aren't in
-- System Maintenance → Lists & FAQ, so those tours couldn't be saved
-- ("… isn't an accommodation in Lists & FAQ").
-- This puts every tour, booking and private tour request on choices from
-- your lists: camping trips get your tent/camping choice, the others your
-- room choices; "Hard" becomes your hardest difficulty.
-- Safe to run more than once. Run it in Supabase → SQL Editor.
-- ═════════════════════════════════════════════

begin;

do $$
declare
  v_room text[] := coalesce((select array_agg(label order by sort_order, label) from public.option_lists
                              where list_key = 'accommodation' and is_active and label !~* '(tent|camp)'), '{}');
  v_camp text[] := coalesce((select array_agg(label order by sort_order, label) from public.option_lists
                              where list_key = 'accommodation' and is_active and label ~* '(tent|camp)'), '{}');
  v_ok text[] := coalesce((select array_agg(label) from public.option_lists where list_key = 'accommodation'), '{}');
  v_diff text[] := coalesce((select array_agg(label order by sort_order, label) from public.option_lists
                              where list_key = 'difficulty' and is_active), '{}');
  v_tables text[] := array['tours', 'bookings', 'exclusive_requests'];
  v_tbl text;
  v_tours int;
  v_bookings int;
  v_requests int;
begin
  foreach v_tbl in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_tbl);
  end loop;

  -- Tours: choices not in the list → camping or room choices from the list.
  update public.tours t
     set accommodation_options = case when exists (select 1 from unnest(t.accommodation_options) x where x ~* '(tent|camp)') then v_camp else v_room end
   where exists (select 1 from unnest(coalesce(t.accommodation_options, '{}')) x where not x = any (v_ok));
  get diagnostics v_tours = row_count;

  -- Difficulty not in the list: Hard → the hardest one.
  if cardinality(v_diff) > 0 then
    update public.tours t
       set difficulty = case lower(t.difficulty) when 'easy' then v_diff[1] when 'moderate' then v_diff[greatest(1, (cardinality(v_diff) + 1) / 2)] else v_diff[cardinality(v_diff)] end
     where t.difficulty is not null
       and not exists (select 1 from public.option_lists o where o.list_key = 'difficulty' and o.label = t.difficulty);
  end if;

  -- Bookings: their tour's first choice (or none).
  update public.bookings b
     set accommodation = (select t.accommodation_options[1] from public.tours t where t.id = b.tour_id)
   where b.accommodation is not null and not b.accommodation = any (v_ok);
  get diagnostics v_bookings = row_count;

  -- Private tour requests and the package sent with them.
  update public.exclusive_requests r
     set accommodation = case when r.accommodation ~* '(tent|camp)' then v_camp[1] else v_room[1] end
   where r.accommodation is not null and not r.accommodation = any (v_ok);
  get diagnostics v_requests = row_count;
  update public.exclusive_requests r
     set package_details = jsonb_set(r.package_details, '{accommodation_options}', to_jsonb(v_room))
   where r.package_details ? 'accommodation_options'
     and exists (select 1 from jsonb_array_elements_text(r.package_details -> 'accommodation_options') x where not x = any (v_ok));

  foreach v_tbl in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_tbl);
  end loop;

  raise notice 'Done: fixed % tours, % bookings, % requests. Room choices: %. Camping choices: %.',
    v_tours, v_bookings, v_requests, array_to_string(v_room, ', '), array_to_string(v_camp, ', ');
end $$;

commit;
