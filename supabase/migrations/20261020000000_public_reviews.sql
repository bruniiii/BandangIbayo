-- ─────────────────────────────────────────────
-- Joiner reviews for the landing page and the joiner homepage.
-- Visitors who aren't logged in can't read reviews or profiles directly,
-- so this returns just what's needed to show them: the rating, comment,
-- photo, tour, and the reviewer's first name + last initial ("Ana C.").
-- Safe to run more than once.
-- ─────────────────────────────────────────────

drop function if exists public.public_reviews(integer, integer);

create or replace function public.public_reviews(p_limit integer default 6, p_min_rating integer default 4)
returns table (
  id               text,
  rating           integer,
  comment          text,
  photo_url        text,
  created_at       timestamptz,
  reviewer_name    text,
  reviewer_avatar  text,
  tour_title       text,
  tour_destination text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id::text,
    r.rating::integer,
    r.comment,
    (select m from jsonb_array_elements_text(
        case when jsonb_typeof(to_jsonb(r) -> 'media') = 'array' then to_jsonb(r) -> 'media' else '[]'::jsonb end
     ) as m
     where m ~* '\.(jpe?g|png|webp|gif)(\?|$)' limit 1),
    r.created_at,
    coalesce(
      nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(left(p.last_name, 1) || '.', '')), ''),
      p.username,
      'A joiner'
    ),
    p.avatar_url,
    t.title,
    t.destination
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  left join public.tours t on t.id = r.tour_id
  where r.rating >= coalesce(p_min_rating, 1)
    and nullif(btrim(coalesce(r.comment, '')), '') is not null
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 24);
$$;

revoke all on function public.public_reviews(integer, integer) from public;
grant execute on function public.public_reviews(integer, integer) to anon, authenticated;
