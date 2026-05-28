insert into public.spaces (id, name, category, primary_purpose, address, latitude, longitude, description, website, phone, hours)
values
  ('00000000-0000-0000-0000-000000000101', 'Northside Social', 'Cafe & Coworking', 'Remote Work', '3211 Wilson Blvd, Arlington, VA 22201', 38.8816, -77.1081, 'Specialty coffee and a reliable upstairs work zone in Clarendon.', 'https://northsidesocialarlington.com', '+17034657777', 'Mon-Fri 7am-7pm, Sat-Sun 8am-7pm'),
  ('00000000-0000-0000-0000-000000000102', 'Crystal City Water Park', 'Park & Nature', 'Picnic', '1750 Crystal Dr, Arlington, VA 22202', 38.8574, -77.0502, 'Outdoor seating, water features, and a strong lunch-break reset.', 'https://www.crystalcitywaterpark.com', null, 'Daily 7am-10pm'),
  ('00000000-0000-0000-0000-000000000103', 'Arlington Central Library Atrium', 'Public Architecture (Atriums, Hotel Lobbies)', 'Lobby Work', '1015 N Quincy St, Arlington, VA 22201', 38.8859, -77.1364, 'Bright public atrium with calm seating and dependable focus energy.', 'https://library.arlingtonva.us', null, 'Mon-Thu 10am-9pm, Fri-Sat 10am-5pm, Sun 1pm-5pm'),
  ('00000000-0000-0000-0000-000000000104', 'The Board Room', 'Interactive Fun (Arcades, Board Games)', 'Board Game Night', '925 N Garfield St, Arlington, VA 22201', 38.8839, -77.0948, 'Board-game bar with a deep game library and easy group tables.', 'https://theboardroomva.com', '+17032434075', 'Tue-Thu 4pm-11pm, Fri-Sat 12pm-1am, Sun 12pm-10pm'),
  ('00000000-0000-0000-0000-000000000105', 'Gravelly Point', 'Smoke & Sunset Spots', 'Sunset Watch', 'George Washington Memorial Pkwy, Arlington, VA 22202', 38.8646, -77.0397, 'Wide-open skyline and plane-watching spot near the river.', null, null, 'Dawn to dusk')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  primary_purpose = excluded.primary_purpose,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  description = excluded.description,
  website = excluded.website,
  phone = excluded.phone,
  hours = excluded.hours,
  updated_at = now();

insert into public.space_attributes (space_id, category, primary_purpose, attribute_scores, overall_score, total_ratings)
values
  ('00000000-0000-0000-0000-000000000101', 'Cafe & Coworking', 'Remote Work', '{"wifi_quality":5,"outlet_density":4,"quietness":4,"chair_comfort":4}', 85, 28),
  ('00000000-0000-0000-0000-000000000102', 'Park & Nature', 'Picnic', '{"scenery_views":5,"seating_benches":4,"shade_cover":3,"cleanliness":4}', 80, 15),
  ('00000000-0000-0000-0000-000000000103', 'Public Architecture (Atriums, Hotel Lobbies)', 'Lobby Work', '{"people_watching":4,"design_aesthetic":5,"public_restrooms":3,"comfort":4}', 80, 22),
  ('00000000-0000-0000-0000-000000000104', 'Interactive Fun (Arcades, Board Games)', 'Board Game Night', '{"gear_game_quality":5,"group_friendliness":5,"cost_value":4,"atmosphere":4}', 90, 35),
  ('00000000-0000-0000-0000-000000000105', 'Smoke & Sunset Spots', 'Sunset Watch', '{"privacy_seclusion":3,"view_quality":5,"wind_shelter":2,"chill_factor":5}', 75, 44)
on conflict (space_id) do update set
  category = excluded.category,
  primary_purpose = excluded.primary_purpose,
  attribute_scores = excluded.attribute_scores,
  overall_score = excluded.overall_score,
  total_ratings = excluded.total_ratings,
  updated_at = now();

-- Auth-backed seed users should be created with the Supabase CLI or admin API.
-- After those users exist, insert matching profiles/ratings using their auth.users IDs.
