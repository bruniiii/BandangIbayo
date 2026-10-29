-- ─────────────────────────────────────────────
-- Admin messages: a copy of every message an admin sends a joiner
--
-- Joiner Accounts (Send Email to Joiner, Email a Joiner) and Tour Management
-- (Message Joiners) save each message here, so:
--   • admins can see what was sent to a joiner, and when;
--   • joiners can read them on their Messages page.
-- mark_admin_messages_read() marks the joiner's own messages as read.
--
-- Run after 20261114000000_request_participants.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.admin_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  source     text not null default 'email' check (source in ('email', 'tour')),
  subject    text not null check (length(btrim(subject)) between 1 and 200),
  message    text not null check (length(btrim(message)) between 1 and 5000),
  tour_id    text,           -- tours.id, as text (Message Joiners only)
  emailed    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_messages_user_idx on public.admin_messages (user_id, created_at desc);

alter table public.admin_messages enable row level security;

drop policy if exists "admin_messages_admin_all" on public.admin_messages;
create policy "admin_messages_admin_all" on public.admin_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_messages_own_select" on public.admin_messages;
create policy "admin_messages_own_select" on public.admin_messages
  for select using (auth.uid() = user_id);

-- Joiners can't edit messages; they only mark their own as read.
create or replace function public.mark_admin_messages_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.admin_messages set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_admin_messages_read() from public, anon;
grant execute on function public.mark_admin_messages_read() to authenticated;
grant select, insert, update, delete on public.admin_messages to authenticated;
