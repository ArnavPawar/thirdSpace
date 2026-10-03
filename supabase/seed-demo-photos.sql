-- Demo photos for the reviews and comments in seed-demo-social.sql.
-- Run after seed-demo-social.sql and review-photos.sql. Safe to re-run.
-- storage_path holds a full Unsplash URL here; the app uses it directly instead of the storage bucket.

insert into public.review_photos (id, user_id, space_id, rating_id, comment_id, storage_path, width, height, created_at)
values
  -- Mike's review of The Board Room
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000104',
    '20000000-0000-4000-8000-000000000001', null,
    'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=1600&q=75&fm=jpg&fit=max', 1600, 900, now() - interval '2 hours'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000104',
    '20000000-0000-4000-8000-000000000001', null,
    'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=1600&q=75&fm=jpg&fit=max', 1600, 1068, now() - interval '2 hours'),
  -- Emma's review of the Arlington Central Library Atrium
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000103',
    '20000000-0000-4000-8000-000000000002', null,
    'https://images.unsplash.com/photo-1568667256549-094345857637?w=1600&q=75&fm=jpg&fit=max', 1600, 2240, now() - interval '5 hours'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000103',
    '20000000-0000-4000-8000-000000000002', null,
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1600&q=75&fm=jpg&fit=max', 1600, 940, now() - interval '5 hours'),
  -- Nina's review of Gravelly Point
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000105',
    '20000000-0000-4000-8000-000000000003', null,
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1600&q=75&fm=jpg&fit=max', 1600, 972, now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000105',
    '20000000-0000-4000-8000-000000000003', null,
    'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1600&q=75&fm=jpg&fit=max', 1600, 900, now() - interval '1 day'),
  -- Leo's review of Northside Social
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000101',
    '20000000-0000-4000-8000-000000000004', null,
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=75&fm=jpg&fit=max', 1600, 1096, now() - interval '2 days'),
  ('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000101',
    '20000000-0000-4000-8000-000000000004', null,
    'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=1600&q=75&fm=jpg&fit=max', 1600, 1068, now() - interval '2 days'),
  -- Nina's comment on Mike's Board Room review
  ('40000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000104',
    null, '30000000-0000-4000-8000-000000000001',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=75&fm=jpg&fit=max', 1600, 900, now() - interval '90 minutes'),
  -- Emma's comment on Leo's Northside Social review
  ('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000101',
    null, '30000000-0000-4000-8000-000000000002',
    'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=1600&q=75&fm=jpg&fit=max', 1600, 1068, now() - interval '1 day')
on conflict (id) do update set
  storage_path = excluded.storage_path,
  width = excluded.width,
  height = excluded.height,
  created_at = excluded.created_at;
