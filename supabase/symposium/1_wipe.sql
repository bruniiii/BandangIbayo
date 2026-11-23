-- ═════════════════════════════════════════════
-- 1_wipe.sql — REMOVES ALL ACTIVITY DATA (cannot be undone)
--
-- Removes: tours (all dates, rates, expenses, drivers & vans per tour,
-- pickup points per tour, tracking, van locations), bookings and their
-- history, payments, refunds, waitlists, favorites, private tours and tour
-- requests, the feed (posts, comments, reactions), reviews, group chats,
-- notifications, messages to joiners, system feedback, and the logs (Audit
-- Trail, emails, errors, cleanups, backups).
--
-- KEEPS: every account (admins and joiners), and all settings: Booking
-- Rules, Payments, Contact Details, Home Page & Banner, Terms & Policies,
-- Notification Templates, Lists & FAQ, Chat Filter, Suppliers, Drivers &
-- Vehicles, Destinations, Pickup Points, Maintenance Mode, tour templates.
-- Uploaded photos stay in Storage.
--
-- Before running: check Supabase → Database → Backups shows a recent backup.
-- Run it in Supabase → SQL Editor. Then run 2_symposium_data.sql.
-- ═════════════════════════════════════════════

begin;

do $$
declare
  v_tables text[] := array[
    'bookings', 'booking_activity', 'pickup_requests', 'refund_log',
    'tours', 'tour_rates', 'tour_expenses', 'tour_expense_lines', 'tour_vehicles', 'tour_meetups', 'tour_tracking_logs',
    'tour_driver_links', 'driver_documents', 'van_locations',
    'tour_chat_messages', 'tour_chat_reactions', 'tour_chat_reads',
    'tour_waitlist', 'tour_favorites', 'pickup_day_notices', 'review_invites',
    'reviews', 'review_reactions', 'inclusion_ratings',
    'feed_posts', 'feed_comments', 'feed_reactions',
    'exclusive_requests', 'exclusive_package_costs',
    'notifications', 'admin_messages', 'system_feedback',
    'admin_activity', 'email_log', 'email_failures', 'client_errors', 'maintenance_log', 'backup_log', 'promo_codes'];
  v_list text;
  t text;
begin
  -- Only the tables this database has.
  select string_agg(format('public.%I', x), ', ') into v_list
    from unnest(v_tables) x where to_regclass('public.' || x) is not null;

  -- The Audit Trail and the refund log can't normally be emptied (they're
  -- append-only): their own triggers are switched off for this one step.
  foreach t in array array['admin_activity', 'refund_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I disable trigger user', t);
    end if;
  end loop;

  execute 'truncate table ' || v_list || ' restart identity';

  foreach t in array array['admin_activity', 'refund_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable trigger user', t);
    end if;
  end loop;

  raise notice 'Done: all activity data removed. Accounts and settings kept.';
end $$;

commit;
