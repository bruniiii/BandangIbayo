-- ─────────────────────────────────────────────
-- Joiners wait 48 hours between feed posts
--
-- A joiner can share one post, then wait 2 days (48 hours) before the next.
-- profiles.last_feed_post_at remembers the last one, so deleting a post
-- doesn't reset the wait. Admins can post any time.
--
-- Run after 20261128000000_joiner_restores_account.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists last_feed_post_at timestamptz;

create or replace function public.feed_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_next timestamptz;
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 48 hours since their last post (even one they deleted since).
    v_last := greatest(
      (select last_feed_post_at from public.profiles where id = auth.uid()),
      (select max(created_at) from public.feed_posts where author_id = auth.uid()));
    v_next := v_last + interval '48 hours';
    if v_next is not null and v_next > now() then
      raise exception 'You can share a new post every 48 hours. You can post again on %.',
        to_char(v_next at time zone 'Asia/Manila', 'Mon DD, YYYY "at" FMHH12:MI AM');
    end if;
    update public.profiles set last_feed_post_at = now() where id = auth.uid();

    new.author_id := auth.uid();
    new.status := 'Pending';
    new.post_type := 'post';
    new.tour_id := null;
    return new;
  end if;
  raise exception 'Only Bandang IBAYO can change posts.';
end;
$$;
