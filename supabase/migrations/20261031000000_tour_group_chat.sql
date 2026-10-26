-- ─────────────────────────────────────────────
-- Tour group chat
--
-- Every tour date has one group chat. Its members are the admins and every
-- joiner with a paid, active booking on that date (a cancelled or rejected
-- booking leaves the chat). Messages can't be edited or deleted.
-- Joiners can send messages until 7 days after the tour ends; after that the
-- chat is read-only.
--
-- tour_chat_reads remembers when each member last opened a chat, for the
-- unread counts. my_tour_chats() lists the caller's chats.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_chat_messages (
      id bigint generated always as identity primary key,
      tour_id %s not null references public.tours(id) on delete cascade,
      user_id uuid default auth.uid() references auth.users(id) on delete set null,
      body text not null check (length(btrim(body)) between 1 and 1000),
      created_at timestamptz not null default now()
    )$f$, tour_id_type);

  execute format($f$
    create table if not exists public.tour_chat_reads (
      tour_id %s not null references public.tours(id) on delete cascade,
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      last_read_at timestamptz not null default now(),
      primary key (tour_id, user_id)
    )$f$, tour_id_type);
end;
$$;

create index if not exists tour_chat_messages_tour_idx on public.tour_chat_messages (tour_id, created_at);

-- Admins, and joiners with a paid booking on that tour that isn't cancelled.
create or replace function public.is_tour_chat_member(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.bookings
     where tour_id = p_tour_id
       and user_id = auth.uid()
       and payment_status = 'Complete'
       and booking_status not in ('Cancelled', 'Rejected')
  );
$$;

revoke all on function public.is_tour_chat_member from public;
grant execute on function public.is_tour_chat_member to authenticated;

-- Still open for new messages: until 7 days after the tour ends.
create or replace function public.tour_chat_open(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tours t
     where t.id = p_tour_id
       and coalesce(t.end_date, t.start_date) + 7 >= (now() at time zone 'Asia/Manila')::date
  );
$$;

revoke all on function public.tour_chat_open from public;
grant execute on function public.tour_chat_open to authenticated;

alter table public.tour_chat_messages enable row level security;
alter table public.tour_chat_reads enable row level security;
grant select, insert on public.tour_chat_messages to authenticated;
grant select, insert, update on public.tour_chat_reads to authenticated;

drop policy if exists "tour_chat_select_members" on public.tour_chat_messages;
create policy "tour_chat_select_members" on public.tour_chat_messages
  for select to authenticated using (public.is_tour_chat_member(tour_id));

drop policy if exists "tour_chat_insert_members" on public.tour_chat_messages;
create policy "tour_chat_insert_members" on public.tour_chat_messages
  for insert to authenticated
  with check (user_id = auth.uid()
              and public.is_tour_chat_member(tour_id)
              and (public.is_admin() or public.tour_chat_open(tour_id)));

drop policy if exists "tour_chat_reads_own" on public.tour_chat_reads;
create policy "tour_chat_reads_own" on public.tour_chat_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_tour_chat_member(tour_id));

-- Trims messages and stamps them with the server's clock.
create or replace function public.tour_chat_messages_clean()
returns trigger
language plpgsql
as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists tour_chat_messages_clean on public.tour_chat_messages;
create trigger tour_chat_messages_clean
  before insert on public.tour_chat_messages
  for each row execute function public.tour_chat_messages_clean();

-- The caller's group chats, newest activity first, with unread counts.
-- Joiners: tours they're booked on that ended less than 30 days ago.
-- Admins: tours with paid bookings that ended less than 30 days ago.
create or replace function public.my_tour_chats()
returns table (
  tour_id public.tours.id%type,
  title text,
  start_date date,
  end_date date,
  members integer,
  last_message text,
  last_message_at timestamptz,
  unread integer,
  is_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with chats as (
    select t.id, t.title, t.start_date, t.end_date
      from public.tours t
     where coalesce(t.end_date, t.start_date) + 30 >= (now() at time zone 'Asia/Manila')::date
       and exists (
         select 1 from public.bookings b
          where b.tour_id = t.id
            and b.payment_status = 'Complete'
            and b.booking_status not in ('Cancelled', 'Rejected')
            and (public.is_admin() or b.user_id = auth.uid())
       )
  )
  select c.id, c.title, c.start_date, c.end_date,
         (select count(distinct b.user_id)::int from public.bookings b
           where b.tour_id = c.id and b.payment_status = 'Complete'
             and b.booking_status not in ('Cancelled', 'Rejected')),
         last.body, last.created_at,
         (select count(*)::int from public.tour_chat_messages m
           where m.tour_id = c.id
             and m.user_id is distinct from auth.uid()
             and m.created_at > coalesce((select r.last_read_at from public.tour_chat_reads r
                                           where r.tour_id = c.id and r.user_id = auth.uid()), '-infinity')),
         public.tour_chat_open(c.id)
    from chats c
    left join lateral (
      select m.body, m.created_at from public.tour_chat_messages m
       where m.tour_id = c.id order by m.created_at desc limit 1
    ) last on true
   order by coalesce(last.created_at, '-infinity') desc, c.start_date asc
$$;

revoke all on function public.my_tour_chats() from public;
grant execute on function public.my_tour_chats() to authenticated;

-- Live updates in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tour_chat_messages') then
    alter publication supabase_realtime add table public.tour_chat_messages;
  end if;
end;
$$;
