-- ─────────────────────────────────────────────
-- Group chat: reply to a specific message
--
-- reply_to points at the message being answered. It must be in the same
-- tour's chat. If that message is ever removed, the reply stays (reply_to
-- becomes empty).
--
-- Run after 20261031000000_tour_group_chat.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.tour_chat_messages
  add column if not exists reply_to bigint references public.tour_chat_messages(id) on delete set null;

-- Trims messages, stamps them with the server's clock, and checks replies.
create or replace function public.tour_chat_messages_clean()
returns trigger
language plpgsql
as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  if new.reply_to is not null and not exists (
    select 1 from public.tour_chat_messages m where m.id = new.reply_to and m.tour_id = new.tour_id
  ) then
    raise exception 'You can only reply to a message in the same chat.';
  end if;
  return new;
end;
$$;
