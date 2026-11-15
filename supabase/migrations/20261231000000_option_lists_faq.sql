-- ─────────────────────────────────────────────
-- Editable short lists and the Help FAQ (System Maintenance → Lists & FAQ)
--
-- Lists that were typed into the code are now kept here and edited by the
-- admins: cancellation reasons, bad-weather reasons, reasons for rejecting a
-- request, accommodation choices and difficulty levels. The Help button's
-- FAQ too (words in {braces} are the Booking Rules, filled in when shown).
--   • Everyone reads the active items (the forms show them); admins add,
--     edit, reorder, archive and restore. Never deleted.
--   • An accommodation or difficulty an upcoming tour uses can't be
--     archived (the database says which tour).
--   • accommodation_choices() reads the list.
--   • Seeded with the exact items the website used, so nothing changes.
--
-- Run after 20261230000000_destinations.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.option_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null check (list_key in ('cancel_reasons', 'weather_reasons', 'reject_reasons', 'accommodation', 'difficulty')),
  label text not null check (length(btrim(label)) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists option_lists_unique on public.option_lists (list_key, lower(btrim(label)));

create table if not exists public.help_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 3 and 200),
  answer text not null check (length(btrim(answer)) between 3 and 2000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['option_lists', 'help_faqs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (is_active or public.is_admin())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.no_hard_delete()', t || '_no_delete', t);
    if to_regprocedure('public.log_admin_activity()') is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_admin_activity', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_activity()', t || '_admin_activity', t);
    end if;
  end loop;
end;
$$;

create or replace function public.option_lists_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
begin
  new.label := regexp_replace(btrim(new.label), '\s+', ' ', 'g');
  if tg_op = 'UPDATE' and new.list_key is distinct from old.list_key then
    raise exception 'An item can''t move to another list.';
  end if;
  if tg_op = 'UPDATE' and old.is_active and (not new.is_active or new.label is distinct from old.label)
     and old.list_key in ('accommodation', 'difficulty') then
    select coalesce(array_agg(distinct t.title || ' (' || to_char(t.start_date, 'Mon FMDD, YYYY') || ')'), '{}') into v_tours
      from public.tours t
     where coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
       and not coalesce(t.is_archived, false)
       and ((old.list_key = 'accommodation' and old.label = any (coalesce(t.accommodation_options, '{}')))
         or (old.list_key = 'difficulty' and t.difficulty = old.label));
    if cardinality(v_tours) > 0 then
      raise exception '"%" can''t be %: upcoming tour% use% it: %.', old.label,
        case when not new.is_active then 'archived' else 'renamed' end,
        case when cardinality(v_tours) = 1 then '' else 's' end, case when cardinality(v_tours) = 1 then 's' else '' end,
        array_to_string(v_tours, ', ');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists option_lists_guard on public.option_lists;
create trigger option_lists_guard before insert or update on public.option_lists
  for each row execute function public.option_lists_guard();

create or replace function public.help_faqs_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists help_faqs_touch on public.help_faqs;
create trigger help_faqs_touch before update on public.help_faqs
  for each row execute function public.help_faqs_touch();

-- The items the website used.
insert into public.option_lists (list_key, label, sort_order)
select v.k, v.l, v.o from (values
  ('cancel_reasons', 'Schedule conflict / change of plans', 1),
  ('cancel_reasons', 'Work or school commitments', 2),
  ('cancel_reasons', 'Personal or family emergency', 3),
  ('cancel_reasons', 'Health reasons / feeling unwell', 4),
  ('cancel_reasons', 'Financial reasons', 5),
  ('cancel_reasons', 'Weather or safety concerns', 6),
  ('cancel_reasons', 'Travel companion(s) can’t join', 7),
  ('cancel_reasons', 'Booked the wrong tour or date', 8),
  ('cancel_reasons', 'No longer interested in this tour', 9),
  ('weather_reasons', 'Typhoon (PAGASA signal)', 1),
  ('weather_reasons', 'Heavy rain / flooding', 2),
  ('weather_reasons', 'Road closure or landslide', 3),
  ('weather_reasons', 'Trail or park closed (DENR / LGU)', 4),
  ('weather_reasons', 'Other safety concern', 5),
  ('reject_reasons', 'The dates are not available', 1),
  ('reject_reasons', 'Destination not offered right now', 2),
  ('reject_reasons', 'Group size not possible', 3),
  ('reject_reasons', 'Budget is too low for this trip', 4),
  ('reject_reasons', 'Unsafe, closed or restricted destination', 5),
  ('reject_reasons', 'Other', 6),
  ('accommodation', 'Tent', 1),
  ('accommodation', 'AC Room', 2),
  ('accommodation', 'Non-AC Room', 3),
  ('difficulty', 'Easy', 1),
  ('difficulty', 'Moderate', 2),
  ('difficulty', 'Challenging', 3)
) as v(k, l, o)
where not exists (select 1 from public.option_lists x where x.list_key = v.k and lower(x.label) = lower(v.l));

insert into public.help_faqs (question, answer, sort_order)
select v.q, v.a, v.o from (values
  ('What is a joiner tour?', 'You join a group tour with other travelers and share the van, guide and other costs, so the trip costs less than going alone.', 1),
  ('How do I create an account?', 'Tap Join Now, fill in your details and click Register. We email you a 6-digit code; enter it and your account is ready. Any email address works.', 2),
  ('How do I book a tour?', 'Open a tour, pick a date and your pickup point, choose how many people are coming (add their names and numbers), then pay online. Your slots are held for {payment_hold_minutes} minutes while you pay.', 3),
  ('How can I pay? Can I pay a downpayment?', 'Pay online with GCash, Maya, card or GrabPay. You can pay in full or a {downpayment_percent}% downpayment. The rest can be paid online from My Bookings or on the day of the tour.', 4),
  ('Can I cancel or move my booking?', 'You can cancel up to {cancellation_cutoff_days} days before the tour: open the booking in My Bookings, choose a reason and confirm. It is cancelled right away. Payments are non-refundable. If the same trip runs on another date, you can move your booking there instead and your payment carries over.', 5),
  ('What if the tour is full?', 'Join the waitlist on that tour. If a slot opens, we''ll notify and email you. Slots go to whoever books first.', 6),
  ('What if the weather is bad?', 'A tour date may be postponed or cancelled because of bad weather, road closures or other safety concerns. You get a notice and a message in the tour''s group chat. Within {weather_choice_hours} hours, choose in My Bookings: keep your slot on the new date (if it was postponed), move to another date of the same tour, or get a {weather_refund_percent}% refund. No choice in {weather_choice_hours} hours = {weather_refund_percent}% refund.', 7),
  ('Where will I be picked up?', 'When you book, choose your pickup point from the list for that tour. You can see it in My Bookings, on your receipt, and on the Day trip card; pickup times are under Tracking.', 8),
  ('What do I need on the day of the tour?', 'Your check-in QR (My Bookings → View Details, or the Day trip card). Show it to the coordinator. You can follow the van and see pickup times under Tracking.', 9),
  ('Can I talk to the other joiners?', 'Yes. Once your payment is confirmed, you join the Group Chat for your tour with the other joiners and the Bandang IBAYO team.', 10),
  ('Can I book a private trip for my group?', 'Yes. Use Private Tours to request a private trip. We send you a package and price, and you confirm it with a {private_downpayment_percent}% downpayment.', 11),
  ('I forgot my password. What do I do?', 'On the login page, tap "Forgot password?" and enter your email. We send you a link to set a new password.', 12)
) as v(q, a, o)
where not exists (select 1 from public.help_faqs);

-- Accommodation choices come from the list now.
create or replace function public.accommodation_choices()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(label order by sort_order, label), array['Tent', 'AC Room', 'Non-AC Room'])
    from public.option_lists where list_key = 'accommodation' and is_active
$$;

-- Tours and bookings were limited to the three built-in accommodations;
-- now any accommodation in the list (active, or archived but already used).
alter table public.tours drop constraint if exists tours_accommodation_options_check;
alter table public.bookings drop constraint if exists bookings_accommodation_check;

create or replace function public.accommodation_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad text;
begin
  if tg_table_name = 'tours' then
    if tg_op = 'UPDATE' and new.accommodation_options is not distinct from old.accommodation_options then return new; end if;
    select x into v_bad from unnest(coalesce(new.accommodation_options, '{}')) x
     where not exists (select 1 from public.option_lists o where o.list_key = 'accommodation' and o.label = x
                        and (o.is_active or (tg_op = 'UPDATE' and x = any (coalesce(old.accommodation_options, '{}')))))
     limit 1;
    if v_bad is not null then raise exception '"%" isn''t an accommodation in Lists & FAQ.', v_bad; end if;
  else
    if tg_op = 'UPDATE' and new.accommodation is not distinct from old.accommodation then return new; end if;
    if new.accommodation is not null and not exists (select 1 from public.option_lists o where o.list_key = 'accommodation' and o.label = new.accommodation) then
      raise exception '"%" isn''t an accommodation choice.', new.accommodation;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tours_accommodation_check on public.tours;
create trigger tours_accommodation_check before insert or update on public.tours
  for each row execute function public.accommodation_check();
drop trigger if exists bookings_accommodation_check on public.bookings;
create trigger bookings_accommodation_check before insert or update on public.bookings
  for each row execute function public.accommodation_check();
