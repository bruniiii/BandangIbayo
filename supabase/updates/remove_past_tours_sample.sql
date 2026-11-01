-- ═══════════════════════════════════════════════════════════════════════
-- REMOVE THE SAMPLE PAST TOURS  (undoes insert_past_tours_sample.sql)
--
-- Deletes the 10 sample joiners (emails ending in @sample.bandangibayo.com),
-- their bookings, reviews and notifications, and the past tour dates that
-- only they booked (with those dates' tracking, pickup stops, rates and
-- expenses). Real tours and real joiners are not touched.
-- Run it in the Supabase SQL Editor: paste it all, click Run.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_users uuid[];
  v_tours bigint[];
  t text;
begin
  v_users := (select coalesce(array_agg(id), '{}') from auth.users
              where lower(email) like '%@sample.bandangibayo.com');

  -- Past dates booked only by sample joiners.
  v_tours := (select coalesce(array_agg(tr.id), '{}') from public.tours tr
              where tr.end_date < current_date
                and exists (select 1 from public.bookings b where b.tour_id = tr.id and b.user_id = any(v_users))
                and not exists (select 1 from public.bookings b where b.tour_id = tr.id and not (b.user_id = any(v_users))));

  delete from public.review_reactions where review_id in (select id from public.reviews where user_id = any(v_users) or tour_id = any(v_tours));
  delete from public.reviews where user_id = any(v_users) or tour_id = any(v_tours);
  delete from public.booking_activity where booking_id in (select id from public.bookings where user_id = any(v_users) or tour_id = any(v_tours));
  delete from public.bookings where user_id = any(v_users) or tour_id = any(v_tours);

  foreach t in array array['tour_tracking_logs', 'tour_vehicles', 'tour_meetups', 'tour_rates', 'tour_expenses',
                           'tour_waitlist', 'tour_favorites', 'tour_chat_messages', 'feed_posts'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where tour_id = any($1)', t) using v_tours;
    end if;
  end loop;
  delete from public.tours where id = any(v_tours);

  delete from public.notifications where user_id = any(v_users) or related_id = any(v_users);
  delete from public.profiles where id = any(v_users);
  delete from auth.users where id = any(v_users);

  raise notice 'Removed % sample joiner(s) and % past tour date(s)',
    coalesce(array_length(v_users, 1), 0), coalesce(array_length(v_tours, 1), 0);
end $$;
