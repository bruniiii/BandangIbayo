-- ─────────────────────────────────────────────
-- Reactions on group chat messages (👍 ❤️ 😂 😮 😢 🙏)
--
-- One reaction per person per message, like Messenger: picking another emoji
-- replaces it, picking the same one again removes it. Only members of that
-- tour's chat can see or react. tour_id is filled in automatically so the
-- browser can listen to one tour's reactions live.
--
-- Run after 20261031000000_tour_group_chat.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_chat_reactions (
      message_id bigint not null references public.tour_chat_messages(id) on delete cascade,
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      tour_id %s references public.tours(id) on delete cascade,
      emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
      created_at timestamptz not null default now(),
      primary key (message_id, user_id)
    )$f$, tour_id_type);
end;
$$;

create index if not exists tour_chat_reactions_tour_idx on public.tour_chat_reactions (tour_id);

-- Fill in the tour from the message, so it can't be faked.
create or replace function public.tour_chat_reactions_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select m.tour_id into new.tour_id from public.tour_chat_messages m where m.id = new.message_id;
  if new.tour_id is null then raise exception 'Message not found.'; end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists tour_chat_reactions_fill on public.tour_chat_reactions;
create trigger tour_chat_reactions_fill
  before insert or update on public.tour_chat_reactions
  for each row execute function public.tour_chat_reactions_fill();

alter table public.tour_chat_reactions enable row level security;
grant select, insert, update, delete on public.tour_chat_reactions to authenticated;

drop policy if exists "tour_chat_reactions_select" on public.tour_chat_reactions;
create policy "tour_chat_reactions_select" on public.tour_chat_reactions
  for select to authenticated using (public.is_tour_chat_member(tour_id));

drop policy if exists "tour_chat_reactions_insert" on public.tour_chat_reactions;
create policy "tour_chat_reactions_insert" on public.tour_chat_reactions
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.tour_chat_messages m
                           where m.id = message_id and public.is_tour_chat_member(m.tour_id)));

drop policy if exists "tour_chat_reactions_update" on public.tour_chat_reactions;
create policy "tour_chat_reactions_update" on public.tour_chat_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tour_chat_reactions_delete" on public.tour_chat_reactions;
create policy "tour_chat_reactions_delete" on public.tour_chat_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Live updates in the browser (deletes send the whole row, so the tour is known).
alter table public.tour_chat_reactions replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tour_chat_reactions') then
    alter publication supabase_realtime add table public.tour_chat_reactions;
  end if;
end;
$$;
