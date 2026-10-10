-- Demo data for events: duplicate review mentions, hosted hangouts with crowds, private capped invites,
-- a live event, and past events with a recap.
-- Run after seed.sql, seed-demo-social.sql, events.sql, hosted-events.sql, and event-chat.sql. Safe to re-run;
-- dates are relative to today, so re-running refreshes them.
--
-- "You" are the most recently active non-demo profile (the same rule seed-demo-social.sql uses).
-- Sign in to the app first so that profile exists, otherwise the invites aimed at you are skipped.
-- Private invite links: open thirdspace://event/<id>?token=<invite_token> using the ids and tokens below.

create extension if not exists "pgcrypto";

-- The demo spots are in Arlington, and the app reads event times as local time.
set timezone to 'America/New_York';

drop table if exists demo_people, demo_hosted, demo_presence;

-- More people so headcounts look like a real crowd. Password for all of them: password123
with crowd(n, username, full_name) as (
  values
    (5, 'priya.k', 'Priya Kapoor'),
    (6, 'jordan_hoops', 'Jordan Reyes'),
    (7, 'samwrites', 'Sam Okafor'),
    (8, 'ava.outside', 'Ava Lindqvist'),
    (9, 'marcus_t', 'Marcus Tran'),
    (10, 'zoe_plays', 'Zoe Bennett'),
    (11, 'diego.eats', 'Diego Alvarez'),
    (12, 'hana_reads', 'Hana Sato'),
    (13, 'tyler.runs', 'Tyler Brooks'),
    (14, 'maya_m', 'Maya Goldberg'),
    (15, 'omar.sunsets', 'Omar Haddad')
)
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  username || '@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', username, 'full_name', full_name),
  now(),
  now()
from crowd
on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data, updated_at = now();

insert into public.profiles (user_id, username, full_name, location)
select id, raw_user_meta_data ->> 'username', raw_user_meta_data ->> 'full_name', 'Arlington, VA'
from auth.users
where id between '10000000-0000-4000-8000-000000000005' and '10000000-0000-4000-8000-000000000015'
on conflict (user_id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  location = excluded.location,
  updated_at = now();

-- Reviews that mention the same trivia night and run club in different words. Each set should show up
-- as one event in the calendar with "3×" / "2×", and share one headcount.
insert into public.ratings (id, user_id, space_id, category, primary_purpose, attribute_scores, overall_score, review_text, created_at)
values
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000104',
    'Interactive Fun (Arcades, Board Games)', 'Group Games',
    '{"gear_game_quality":5,"group_friendliness":5,"cost_value":4,"atmosphere":5}', 95,
    'Came for trivia night, they run it every Tuesday. Our team came in third and still had a blast.', now() - interval '6 days'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000104',
    'Interactive Fun (Arcades, Board Games)', 'Group Games',
    '{"gear_game_quality":5,"group_friendliness":5,"cost_value":4,"atmosphere":4}', 90,
    'Trivia every Tuesday at 8pm and the hosts are hilarious. Teams of up to six, show up early.', now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000104',
    'Interactive Fun (Arcades, Board Games)', 'Group Games',
    '{"gear_game_quality":4,"group_friendliness":5,"cost_value":4,"atmosphere":4}', 85,
    'Trivia on Tuesdays at 8pm is the move. Sign your team up at theboardroomva.com/trivia so you get a table.', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000105',
    'Smoke & Sunset Spots', 'Sunset Watch',
    '{"privacy_seclusion":3,"view_quality":5,"wind_shelter":2,"chill_factor":5}', 75,
    'Run club meets here every Thursday at 6:30pm for a sunset loop. Everyone''s welcome.', now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000105',
    'Smoke & Sunset Spots', 'Sunset Watch',
    '{"privacy_seclusion":3,"view_quality":5,"wind_shelter":3,"chill_factor":5}', 80,
    'Joined the run club Thursday nights. Easy pace groups and the sunset at the turnaround is unreal.', now() - interval '2 days')
on conflict (id) do update set review_text = excluded.review_text, created_at = excluded.created_at;

-- The app extracts these when a review is saved; seeded reviews skip that, so the events go in directly.
insert into public.space_events (
  space_id, source_type, source_id, source_user_id, title, kind, weekday, start_time, link_url, snippet, dedupe_key, source_created_at
)
select r.space_id, 'rating', r.id::text, r.user_id, v.title, 'weekly', v.weekday, v.start_time, v.link_url, v.snippet,
  'weekly|' || v.title || '|' || v.weekday, r.created_at
from (
  values
    ('20000000-0000-4000-8000-000000000005'::uuid, 'Trivia Night', 2, null::text, null::text,
      'Came for trivia night, they run it every Tuesday'),
    ('20000000-0000-4000-8000-000000000006'::uuid, 'Trivia Night', 2, '20:00', null,
      'Trivia every Tuesday at 8pm and the hosts are hilarious'),
    ('20000000-0000-4000-8000-000000000007'::uuid, 'Trivia Night', 2, '20:00', 'https://theboardroomva.com/trivia',
      'Trivia on Tuesdays at 8pm is the move'),
    ('20000000-0000-4000-8000-000000000008'::uuid, 'Run Club', 4, '18:30', null,
      'Run club meets here every Thursday at 6:30pm for a sunset loop'),
    ('20000000-0000-4000-8000-000000000009'::uuid, 'Run Club', 4, null, null,
      'Joined the run club Thursday nights')
) as v(rating_id, title, weekday, start_time, link_url, snippet)
join public.ratings r on r.id = v.rating_id
on conflict (source_type, source_id, dedupe_key) do update set source_created_at = excluded.source_created_at;

-- Hosted hangouts. Fixed ids so re-running updates them in place.
create temp table demo_people (key text primary key, user_id uuid);
insert into demo_people values
  ('mike', '10000000-0000-4000-8000-000000000001'), ('emma', '10000000-0000-4000-8000-000000000002'),
  ('nina', '10000000-0000-4000-8000-000000000003'), ('leo', '10000000-0000-4000-8000-000000000004'),
  ('priya', '10000000-0000-4000-8000-000000000005'), ('jordan', '10000000-0000-4000-8000-000000000006'),
  ('sam', '10000000-0000-4000-8000-000000000007'), ('ava', '10000000-0000-4000-8000-000000000008'),
  ('marcus', '10000000-0000-4000-8000-000000000009'), ('zoe', '10000000-0000-4000-8000-000000000010'),
  ('diego', '10000000-0000-4000-8000-000000000011'), ('hana', '10000000-0000-4000-8000-000000000012'),
  ('tyler', '10000000-0000-4000-8000-000000000013'), ('maya', '10000000-0000-4000-8000-000000000014'),
  ('omar', '10000000-0000-4000-8000-000000000015');

insert into demo_people
select 'you', user_id from public.profiles
where user_id::text not like '10000000-0000-4000-8000-%'
order by updated_at desc
limit 1;

create temp table demo_hosted (
  id uuid primary key, host text, space_id uuid, title text, theme text, visibility text,
  event_date date, start_time text, capacity integer, allow_over boolean, description text, token text
);

insert into demo_hosted values
  -- Happening right now, so "I'm here" shows up.
  ('50000000-0000-4000-8000-000000000001', 'mike', '00000000-0000-0000-0000-000000000104', 'Board game night', 'night', 'public',
    current_date, to_char(greatest(now() - interval '1 hour', date_trunc('day', now())), 'HH24:00'), 6, false,
    'Catan and Codenames on the back table. Newcomers welcome.', 'demo-board-game-night'),
  -- "Board game night at The Board Room, Friday 8pm, 4 spots open."
  ('50000000-0000-4000-8000-000000000002', 'mike', '00000000-0000-0000-0000-000000000104', 'Friday board game night', 'indigo', 'public',
    current_date + (((5 - extract(dow from current_date)::int + 7) % 7) + case when extract(dow from current_date) = 5 then 7 else 0 end),
    '20:00', 8, false, 'Bring a game or play one of theirs. Two tables, mixed skill levels.', 'demo-friday-game-night'),
  ('50000000-0000-4000-8000-000000000003', 'mike', '00000000-0000-0000-0000-000000000101', 'After-work coffee hang', 'cafe', 'public',
    current_date + 2, '18:00', null, false, 'Laptops optional. We will grab the big table upstairs.', 'demo-coffee-hang'),
  -- Private and full. You answered "Can't go", so "I'm in" shows Full.
  ('50000000-0000-4000-8000-000000000004', 'nina', '00000000-0000-0000-0000-000000000105', 'Sunset supper club', 'sunset', 'private',
    current_date + 4, '18:30', 6, false, 'Six seats, one long blanket. Everyone brings a dish to share.', 'demo-supper-club'),
  -- Private with two spots left. You're going, so the group chat is open.
  ('50000000-0000-4000-8000-000000000005', 'emma', '00000000-0000-0000-0000-000000000102', 'Picnic potluck', 'grove', 'private',
    current_date + 5, '13:00', 10, false, 'Invite only. Emma is bringing the speaker, you bring a side.', 'demo-picnic-potluck'),
  -- Private, over the cap, and the host is letting extras in.
  ('50000000-0000-4000-8000-000000000006', 'leo', '00000000-0000-0000-0000-000000000101', 'Saturday cowork sprint', 'cafe', 'private',
    current_date + 3, '10:00', 10, true, 'Two 90-minute focus blocks with a coffee break in between. Invite only.', 'demo-cowork-sprint'),
  -- Already happened, so you see the recap.
  ('50000000-0000-4000-8000-000000000007', 'nina', '00000000-0000-0000-0000-000000000105', 'Plane-spotting picnic', 'sunset', 'public',
    current_date - 3, '17:30', null, false, 'Blankets out by the runway fence. Bring snacks.', 'demo-plane-picnic');

insert into public.space_events (
  id, space_id, source_type, source_id, source_user_id, host_user_id, visibility, theme, title, kind,
  event_date, start_time, snippet, description, capacity, allow_over_capacity, invite_token, dedupe_key,
  source_created_at, cancelled_at
)
select h.id, h.space_id, 'hosted', h.id::text, p.user_id, p.user_id, h.visibility, h.theme, h.title, 'one_time',
  h.event_date, h.start_time, h.description, h.description, h.capacity, h.allow_over, h.token, h.id::text,
  now() - interval '7 days', null
from demo_hosted h
join demo_people p on p.key = h.host
on conflict (id) do update set
  event_date = excluded.event_date,
  start_time = excluded.start_time,
  title = excluded.title,
  description = excluded.description,
  snippet = excluded.snippet,
  capacity = excluded.capacity,
  allow_over_capacity = excluded.allow_over_capacity,
  visibility = excluded.visibility,
  theme = excluded.theme,
  invite_token = excluded.invite_token,
  cancelled_at = null;

-- Who's going, who can't, and who showed up. Cleared first so re-running doesn't pile up stale dates.
delete from public.event_rsvps where event_id in (select id from demo_hosted);
delete from public.event_checkins where event_id in (select id from demo_hosted);
delete from public.event_messages where event_id in (select id from demo_hosted);

create temp table demo_presence (event_id uuid, kind text, people text[]);
insert into demo_presence values
  ('50000000-0000-4000-8000-000000000001', 'going', array['nina', 'emma', 'zoe', 'marcus']),
  ('50000000-0000-4000-8000-000000000001', 'here', array['mike', 'nina', 'zoe']),
  ('50000000-0000-4000-8000-000000000002', 'going', array['mike', 'jordan', 'diego', 'maya']),
  ('50000000-0000-4000-8000-000000000003', 'going', array['you', 'emma', 'priya', 'sam', 'hana', 'leo']),
  ('50000000-0000-4000-8000-000000000004', 'going', array['nina', 'omar', 'ava', 'hana', 'leo', 'priya']),
  ('50000000-0000-4000-8000-000000000004', 'not_going', array['you']),
  ('50000000-0000-4000-8000-000000000005', 'going', array['emma', 'you', 'nina', 'sam', 'zoe', 'tyler', 'maya', 'omar']),
  ('50000000-0000-4000-8000-000000000005', 'not_going', array['diego']),
  ('50000000-0000-4000-8000-000000000006', 'going', array['leo', 'you', 'mike', 'nina', 'jordan', 'marcus', 'diego', 'tyler', 'omar', 'sam', 'ava']),
  ('50000000-0000-4000-8000-000000000006', 'not_going', array['emma']),
  ('50000000-0000-4000-8000-000000000007', 'going', array['you', 'nina', 'omar', 'ava', 'mike', 'hana', 'tyler']),
  ('50000000-0000-4000-8000-000000000007', 'here', array['you', 'nina', 'omar', 'ava', 'hana']);

-- Trivia and run club presence goes on the series anchor. Next week's trivia has a crowd; last week's has a recap.
-- Only demo people's rows are touched, so real RSVPs on these series survive a re-run.
insert into demo_presence (event_id, kind, people)
with trivia as (
  select series_id,
    current_date + ((2 - extract(dow from current_date)::int + 7) % 7) as next_date
  from public.space_events
  where source_type = 'rating' and source_id = '20000000-0000-4000-8000-000000000005'
),
run_club as (
  select series_id,
    current_date + ((4 - extract(dow from current_date)::int + 7) % 7) as next_date
  from public.space_events
  where source_type = 'rating' and source_id = '20000000-0000-4000-8000-000000000008'
)
select series_id, 'going@' || next_date, array['nina', 'emma', 'priya', 'sam', 'zoe', 'marcus', 'hana', 'diego', 'maya'] from trivia
union all select series_id, 'not_going@' || next_date, array['tyler'] from trivia
union all select series_id, 'going@' || (next_date - 7), array['you', 'nina', 'emma', 'priya', 'sam', 'zoe', 'jordan'] from trivia
union all select series_id, 'here@' || (next_date - 7), array['you', 'nina', 'priya', 'sam', 'jordan'] from trivia
union all select series_id, 'going@' || next_date, array['tyler', 'ava', 'omar', 'mike'] from run_club;

delete from public.event_rsvps
where event_id in (select event_id from demo_presence where kind like '%@%')
  and user_id in (select user_id from demo_people);
delete from public.event_checkins
where event_id in (select event_id from demo_presence where kind like '%@%')
  and user_id in (select user_id from demo_people);

-- Hosted rows use the event's own date; series rows carry their date after the @.
insert into public.event_rsvps (event_id, occurrence_date, user_id, status, created_at)
select d.event_id,
  coalesce(nullif(split_part(d.kind, '@', 2), '')::date, e.event_date),
  p.user_id,
  split_part(d.kind, '@', 1),
  now() - (ord * interval '7 minutes')
from demo_presence d
join public.space_events e on e.id = d.event_id
cross join lateral unnest(d.people) with ordinality as person(key, ord)
join demo_people p on p.key = person.key
where split_part(d.kind, '@', 1) in ('going', 'not_going')
on conflict (event_id, occurrence_date, user_id) do update set status = excluded.status;

insert into public.event_checkins (event_id, occurrence_date, user_id, created_at)
select d.event_id,
  coalesce(nullif(split_part(d.kind, '@', 2), '')::date, e.event_date),
  p.user_id,
  now() - (ord * interval '4 minutes')
from demo_presence d
join public.space_events e on e.id = d.event_id
cross join lateral unnest(d.people) with ordinality as person(key, ord)
join demo_people p on p.key = person.key
where split_part(d.kind, '@', 1) = 'here'
on conflict do nothing;

-- Group chats for the coffee hang and the potluck.
insert into public.event_messages (event_id, occurrence_date, user_id, body, created_at)
select m.event_id, e.event_date, p.user_id, m.body, now() - (m.minutes_ago * interval '1 minute')
from (
  values
    ('50000000-0000-4000-8000-000000000003'::uuid, 'mike', 'I will get there around 5:45 to hold the big table.', 48),
    ('50000000-0000-4000-8000-000000000003'::uuid, 'emma', 'Bringing my laptop, might stay after.', 36),
    ('50000000-0000-4000-8000-000000000003'::uuid, 'priya', 'Is the upstairs open on weekdays? First time here.', 24),
    ('50000000-0000-4000-8000-000000000003'::uuid, 'mike', 'Yep, take the stairs past the pastry case.', 12),
    ('50000000-0000-4000-8000-000000000005'::uuid, 'emma', 'Spot is by the fountain on the north side. Look for the green blanket.', 36),
    ('50000000-0000-4000-8000-000000000005'::uuid, 'sam', 'I can bring a pasta salad.', 24),
    ('50000000-0000-4000-8000-000000000005'::uuid, 'zoe', 'Lemonade + cups on me', 12)
) as m(event_id, person, body, minutes_ago)
join public.space_events e on e.id = m.event_id
join demo_people p on p.key = m.person;

drop table if exists demo_people, demo_hosted, demo_presence;
reset timezone;
