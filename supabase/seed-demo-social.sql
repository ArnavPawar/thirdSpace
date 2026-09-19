create extension if not exists "pgcrypto";

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'mikeplays@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"mikeplays","full_name":"Mike Rodriguez"}',
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'emma.reads@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"emma_reads","full_name":"Emma Thompson"}',
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'nina.nights@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"nina_nights","full_name":"Nina Patel"}',
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'leo.designs@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"leo_designs","full_name":"Leo Martin"}',
    now(),
    now()
  )
on conflict (id) do update set
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into public.profiles (user_id, username, full_name, bio, location)
values
  ('10000000-0000-4000-8000-000000000001', 'mikeplays', 'Mike Rodriguez', 'Pickup basketball, late-night food, and easy group spots.', 'Arlington, VA'),
  ('10000000-0000-4000-8000-000000000002', 'emma_reads', 'Emma Thompson', 'Quiet corners, libraries, and cozy public spaces.', 'Washington, DC'),
  ('10000000-0000-4000-8000-000000000003', 'nina_nights', 'Nina Patel', 'Cozy bars, sunset overlooks, and low-key nights.', 'Alexandria, VA'),
  ('10000000-0000-4000-8000-000000000004', 'leo_designs', 'Leo Martin', 'Architecture walks, atriums, and places with good light.', 'Rosslyn, VA')
on conflict (user_id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  bio = excluded.bio,
  location = excluded.location,
  updated_at = now();

insert into public.ratings (
  id,
  user_id,
  space_id,
  category,
  primary_purpose,
  attribute_scores,
  overall_score,
  review_text,
  created_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000104',
    'Interactive Fun (Arcades, Board Games)',
    'Board Game Night',
    '{"gear_game_quality":5,"group_friendliness":5,"cost_value":4,"atmosphere":4}',
    90,
    'Great group energy and the staff helps pick games without making it awkward.',
    now() - interval '2 hours'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000103',
    'Public Architecture (Atriums, Hotel Lobbies)',
    'Lobby Work',
    '{"people_watching":4,"design_aesthetic":5,"public_restrooms":3,"comfort":4}',
    80,
    'Excellent low-cost study environment. Limited hours, but very worth planning around.',
    now() - interval '5 hours'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000105',
    'Smoke & Sunset Spots',
    'Sunset Watch',
    '{"privacy_seclusion":3,"view_quality":5,"wind_shelter":2,"chill_factor":5}',
    75,
    'Best sunset reset when you want river views and plane watching.',
    now() - interval '1 day'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000101',
    'Cafe & Coworking',
    'Remote Work',
    '{"wifi_quality":5,"outlet_density":4,"quietness":4,"chair_comfort":4}',
    85,
    'Reliable upstairs tables, strong coffee, and a good morning work crowd.',
    now() - interval '2 days'
  )
on conflict (id) do update set
  review_text = excluded.review_text,
  created_at = excluded.created_at;

insert into public.review_comments (id, rating_id, user_id, body, created_at)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Adding this to my next group night list.', now() - interval '90 minutes'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'The upstairs tables are best before noon.', now() - interval '1 day')
on conflict (id) do update set
  body = excluded.body,
  created_at = excluded.created_at;

insert into public.rating_likes (rating_id, user_id)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.user_rankings (user_id, space_id, personal_rank, notes, is_favorite, last_visited)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000104', 1, 'Best group hangout.', true, now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000103', 1, 'Favorite quiet work spot.', true, now() - interval '5 hours'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000105', 1, 'Sunset reset.', true, now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000101', 1, 'Coffee and design notes.', true, now() - interval '2 days')
on conflict (user_id, space_id) do update set
  personal_rank = excluded.personal_rank,
  notes = excluded.notes,
  is_favorite = excluded.is_favorite,
  last_visited = excluded.last_visited,
  updated_at = now();

do $$
declare
  current_user_id uuid;
begin
  select profiles.user_id
  into current_user_id
  from public.profiles
  where profiles.user_id not in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004'
  )
  order by profiles.updated_at desc
  limit 1;

  insert into public.follows (follower_id, following_id)
  values
    ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
    ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003')
  on conflict do nothing;

  if current_user_id is not null then
    insert into public.follows (follower_id, following_id)
    values
      (current_user_id, '10000000-0000-4000-8000-000000000001'),
      (current_user_id, '10000000-0000-4000-8000-000000000003'),
      ('10000000-0000-4000-8000-000000000002', current_user_id),
      ('10000000-0000-4000-8000-000000000004', current_user_id)
    on conflict do nothing;
  end if;
end $$;

insert into public.space_attributes (
  space_id,
  category,
  primary_purpose,
  attribute_scores,
  overall_score,
  total_ratings
)
select distinct on (rating_rollups.space_id)
  rating_rollups.space_id,
  rating_rollups.category,
  rating_rollups.primary_purpose,
  rating_rollups.attribute_scores,
  rating_rollups.overall_score,
  rating_rollups.total_ratings
from (
  select
    ratings.space_id,
    (array_agg(ratings.category order by ratings.created_at desc))[1] as category,
    (array_agg(ratings.primary_purpose order by ratings.created_at desc))[1] as primary_purpose,
    (
      select jsonb_object_agg(score_keys.key, round(score_keys.average_value::numeric, 1))
      from (
        select
          score_entries.key,
          avg((score_entries.value)::numeric) as average_value
        from public.ratings rating_entries
        cross join lateral jsonb_each_text(rating_entries.attribute_scores) as score_entries(key, value)
        where rating_entries.space_id = ratings.space_id
        group by score_entries.key
      ) score_keys
    ) as attribute_scores,
    round(avg(ratings.overall_score))::integer as overall_score,
    count(*)::integer as total_ratings
  from public.ratings
  group by ratings.space_id
) rating_rollups
on conflict (space_id) do update set
  category = excluded.category,
  primary_purpose = excluded.primary_purpose,
  attribute_scores = excluded.attribute_scores,
  overall_score = excluded.overall_score,
  total_ratings = excluded.total_ratings,
  updated_at = now();
