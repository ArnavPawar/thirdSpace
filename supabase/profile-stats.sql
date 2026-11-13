-- Profile stats (hosted, went to, guests, spots ranked...) and city leaderboards for top rankers and top hosts.
-- Run after schema.sql, secret-spots-and-vibes.sql, events.sql, and hosted-events.sql. Safe to re-run.
-- Spots added from the app get a city from the map search. To fill in spots added before this, set
-- SUPABASE_SERVICE_ROLE_KEY in .env and run `npm run backfill:cities`.

-- "Arlington, VA" in the US, "London, United Kingdom" elsewhere, so same-named cities don't merge.
alter table public.spaces add column if not exists city text;
create index if not exists spaces_city_idx on public.spaces (city) where city is not null;
create index if not exists follows_following_idx on public.follows (following_id);

-- Used by scripts/backfill-space-cities.ts.
grant usage on schema public to service_role;
grant select, update on public.spaces to service_role;

-- One row per person with something to count on this board. A city board only counts spots in that city;
-- a friends board counts everything, for the person and everyone they follow.
-- rankers: distinct spots rated. hosts: hosted hangouts that weren't cancelled and whose day has come.
create or replace function public.leaderboard_scores(board text, city_name text, friends_of uuid)
returns table (user_id uuid, score bigint)
language sql
stable
set search_path = public
as $$
  with pool as (
    select friends_of as user_id where friends_of is not null
    union
    select f.following_id from public.follows f where friends_of is not null and f.follower_id = friends_of
  )
  select r.user_id, count(distinct r.space_id)
  from public.ratings r
  join public.spaces s on s.id = r.space_id
  where board = 'rankers'
    and (city_name is null or s.city = city_name)
    and (friends_of is null or r.user_id in (select pool.user_id from pool))
  group by r.user_id
  union all
  select e.host_user_id, count(*)
  from public.space_events e
  join public.spaces s on s.id = e.space_id
  where board = 'hosts'
    and e.source_type = 'hosted'
    and e.cancelled_at is null
    and e.event_date <= current_date
    and (city_name is null or s.city = city_name)
    and (friends_of is null or e.host_user_id in (select pool.user_id from pool))
  group by e.host_user_id
$$;

-- The city where someone has done the most on this board, so a person can rank spots in one city and host in another.
create or replace function public.leaderboard_home_city(target_user uuid, board text)
returns text
language sql
stable
set search_path = public
as $$
  select activity.city
  from (
    select s.city, count(distinct r.space_id) as points, max(r.created_at) as latest
    from public.ratings r
    join public.spaces s on s.id = r.space_id
    where board = 'rankers' and r.user_id = target_user and s.city is not null
    group by s.city
    union all
    select s.city, count(*), max(e.created_at)
    from public.space_events e
    join public.spaces s on s.id = e.space_id
    where board = 'hosts'
      and e.host_user_id = target_user
      and e.source_type = 'hosted'
      and e.cancelled_at is null
      and e.event_date <= current_date
      and s.city is not null
    group by s.city
  ) activity
  order by activity.points desc, activity.latest desc, activity.city
  limit 1
$$;

-- "#1 of 2 in Alexandria" means nothing, so until a city has enough people on a board, people are ranked
-- against who they follow instead.
create or replace function public.leaderboard_scope(target_user uuid, board text, out scope text, out city text)
language plpgsql
stable
set search_path = public
as $$
declare
  min_city_people constant integer := 10;
begin
  city := public.leaderboard_home_city(target_user, board);
  if city is not null and (select count(*) from public.leaderboard_scores(board, city, null)) >= min_city_people then
    scope := 'city';
  else
    scope := 'friends';
    city := null;
  end if;
end;
$$;

create or replace function public.leaderboard_ranked(target_user uuid, board text, board_scope text, board_city text)
returns table (user_id uuid, score bigint, place bigint, total bigint)
language sql
stable
set search_path = public
as $$
  select s.user_id, s.score, rank() over (order by s.score desc), count(*) over ()
  from public.leaderboard_scores(board, board_city, case when board_scope = 'friends' then target_user end) s
$$;

-- Null when there's nothing to rank: they haven't done this yet, or they'd be the only one on their friends board.
create or replace function public.leaderboard_position(target_user uuid, board text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  board_scope text;
  board_city text;
  my_place bigint;
  board_total bigint;
begin
  select s.scope, s.city into board_scope, board_city from public.leaderboard_scope(target_user, board) s;

  select r.place, r.total into my_place, board_total
  from public.leaderboard_ranked(target_user, board, board_scope, board_city) r
  where r.user_id = target_user;

  if my_place is null or board_total < 2 then
    return null;
  end if;

  return jsonb_build_object('scope', board_scope, 'city', board_city, 'rank', my_place, 'total', board_total);
end;
$$;

revoke execute on function public.leaderboard_scores(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.leaderboard_home_city(uuid, text) from public, anon, authenticated;
revoke execute on function public.leaderboard_scope(uuid, text) from public, anon, authenticated;
revoke execute on function public.leaderboard_ranked(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.leaderboard_position(uuid, text) from public, anon, authenticated;

-- Security definer because private hangouts and their RSVPs are hidden from other viewers. Only counts come back,
-- never which events or spots they were.
-- "Went to" is a check-in or a "going" RSVP once the day has come, counted once per occurrence, never your own hangouts.
-- "Guests" is everyone else who RSVPed going or checked in to a hangout you hosted.
create or replace function public.get_profile_stats(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hosted as (
    select e.id
    from public.space_events e
    where e.host_user_id = target_user
      and e.source_type = 'hosted'
      and e.cancelled_at is null
      and e.event_date <= current_date
  ),
  went as (
    select c.event_id, c.occurrence_date from public.event_checkins c where c.user_id = target_user
    union
    select r.event_id, r.occurrence_date from public.event_rsvps r
    where r.user_id = target_user and r.status = 'going' and r.occurrence_date <= current_date
  ),
  guests as (
    select r.event_id, r.occurrence_date, r.user_id
    from public.event_rsvps r
    join hosted h on h.id = r.event_id
    where r.status = 'going'
    union
    select c.event_id, c.occurrence_date, c.user_id
    from public.event_checkins c
    join hosted h on h.id = c.event_id
  )
  select jsonb_build_object(
    'spaces_rated', (select count(distinct r.space_id) from public.ratings r where r.user_id = target_user),
    'reviews_written', (
      select count(*) from public.ratings r
      where r.user_id = target_user and nullif(btrim(r.review_text), '') is not null
    ),
    'likes_received', (
      select count(*) from public.rating_likes l
      join public.ratings r on r.id = l.rating_id
      where r.user_id = target_user and l.user_id <> target_user
    ),
    'categories_explored', (select count(distinct r.category) from public.ratings r where r.user_id = target_user),
    'cities_explored', (
      select count(distinct s.city) from public.ratings r
      join public.spaces s on s.id = r.space_id
      where r.user_id = target_user
    ),
    'hosted', (select count(*) from hosted),
    'attended', (
      select count(*) from went
      join public.space_events e on e.id = went.event_id
      where e.cancelled_at is null and e.host_user_id is distinct from target_user
    ),
    'guests', (select count(*) from guests where guests.user_id <> target_user),
    'followers', (select count(*) from public.follows f where f.following_id = target_user),
    'following', (select count(*) from public.follows f where f.follower_id = target_user),
    'ranks', jsonb_strip_nulls(jsonb_build_object(
      'rankers', public.leaderboard_position(target_user, 'rankers'),
      'hosts', public.leaderboard_position(target_user, 'hosts')
    ))
  );
$$;

-- The board behind a profile's rank badge: the top 10, plus that person if they're further down.
create or replace function public.get_leaderboard(target_user uuid, board text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  board_scope text;
  board_city text;
  result jsonb;
begin
  if board not in ('rankers', 'hosts') then
    raise exception 'Unknown leaderboard';
  end if;

  select s.scope, s.city into board_scope, board_city from public.leaderboard_scope(target_user, board) s;

  with ranked as (
    select * from public.leaderboard_ranked(target_user, board, board_scope, board_city)
  ),
  shown as (
    (select * from ranked order by ranked.place, ranked.user_id limit 10)
    union
    select * from ranked where ranked.user_id = target_user
  )
  select jsonb_build_object(
    'scope', board_scope,
    'city', board_city,
    'total', coalesce((select max(ranked.total) from ranked), 0),
    'entries', coalesce(
      jsonb_agg(
        jsonb_build_object('rank', shown.place, 'score', shown.score, 'profile', to_jsonb(p))
        order by shown.place, p.username
      ) filter (where shown.user_id is not null),
      '[]'::jsonb
    )
  )
  into result
  from (select 1) anchor
  left join shown on true
  left join public.profiles p on p.user_id = shown.user_id;

  return result;
end;
$$;

grant execute on function public.get_profile_stats(uuid) to anon, authenticated;
grant execute on function public.get_leaderboard(uuid, text) to anon, authenticated;
