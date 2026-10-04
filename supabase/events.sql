-- Community events calendar: events extracted from review text and space descriptions.
-- Run after schema.sql and secret-spots-and-vibes.sql. Safe to re-run.

create table if not exists public.space_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  source_type text not null check (source_type in ('rating', 'space')),
  source_id text not null,
  source_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) <= 60),
  kind text not null check (kind in ('one_time', 'weekly')),
  event_date date,
  weekday smallint check (weekday between 0 and 6),
  start_time text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  link_url text,
  snippet text not null check (char_length(snippet) <= 240),
  dedupe_key text not null,
  source_created_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (kind = 'one_time' and event_date is not null and weekday is null)
    or (kind = 'weekly' and weekday is not null and event_date is null)
  ),
  unique (source_type, source_id, dedupe_key)
);

create index if not exists space_events_date_idx on public.space_events(event_date) where kind = 'one_time';
create index if not exists space_events_weekly_idx on public.space_events(kind, weekday, source_created_at);
create index if not exists space_events_space_idx on public.space_events(space_id);

alter table public.space_events enable row level security;

grant select on public.space_events to anon, authenticated;
grant insert on public.space_events to authenticated;

-- Used by scripts/backfill-events.ts.
grant usage on schema public to service_role;
grant select on public.ratings, public.spaces to service_role;
grant select, insert on public.space_events to service_role;

drop policy if exists "public events are readable" on public.space_events;
create policy "public events are readable" on public.space_events
  for select using (
    exists (select 1 from public.spaces s where s.id = space_id and not s.is_secret)
  );

drop policy if exists "users can add extracted events" on public.space_events;
create policy "users can add extracted events" on public.space_events
  for insert with check (
    auth.uid() is not null
    and (source_user_id is null or source_user_id = auth.uid())
    and exists (select 1 from public.spaces s where s.id = space_id and not s.is_secret)
  );
