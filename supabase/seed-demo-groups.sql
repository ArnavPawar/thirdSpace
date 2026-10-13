-- Sample groups for the seeded demo accounts. Safe to re-run.
-- Run after groups.sql and seed-demo-social.sql. Hangout links are skipped until seed-demo-events.sql has been run.
--
-- nina.nights@example.com owns Arlington girls and belongs to Company hangout.
-- Discover shows Rosslyn run club. Profile shows Emma's invite to Picnic crew.
-- Password for every seeded account is password123.

insert into public.groups (id, name, description, visibility, invite_token, created_by)
values
  (
    '61000000-0000-4000-8000-000000000001',
    'Arlington girls',
    'What is happening around Arlington.',
    'public',
    'demo-arlington-girls',
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'Company hangout',
    'The team, off the clock.',
    'private',
    'demo-company-hangout',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    'Rosslyn run club',
    'Easy loops after work. Anyone can join.',
    'public',
    'demo-rosslyn-run-club',
    '10000000-0000-4000-8000-000000000004'
  ),
  (
    '61000000-0000-4000-8000-000000000004',
    'Picnic crew',
    'Blankets, snacks, and a speaker.',
    'private',
    'demo-picnic-crew',
    '10000000-0000-4000-8000-000000000002'
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  visibility = excluded.visibility,
  invite_token = excluded.invite_token,
  created_by = excluded.created_by,
  updated_at = now();

insert into public.group_members (group_id, user_id, role)
values
  ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'owner'),
  ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member'),
  ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'member'),
  ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'owner'),
  ('61000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'owner')
on conflict (group_id, user_id) do update set role = excluded.role;

insert into public.group_invites (group_id, invitee_user_id, invited_by, status)
values (
  '61000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  'pending'
)
on conflict (group_id, invitee_user_id) do nothing;

insert into public.event_groups (event_id, group_id, created_by)
select event.id, '61000000-0000-4000-8000-000000000001', event.host_user_id
from public.space_events event
where event.id in (
  '50000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
)
on conflict (event_id, group_id) do nothing;

insert into public.event_groups (event_id, group_id, created_by)
select event.id, '61000000-0000-4000-8000-000000000002', event.host_user_id
from public.space_events event
where event.id = '50000000-0000-4000-8000-000000000003'
on conflict (event_id, group_id) do nothing;

insert into public.group_spots (group_id, space_id, added_by)
select '61000000-0000-4000-8000-000000000002', space.id, '10000000-0000-4000-8000-000000000001'
from public.spaces space
where space.id = '00000000-0000-0000-0000-000000000101'
on conflict (group_id, space_id) do nothing;
