-- Hosted hangouts on top of extracted space_events.
-- Run after schema.sql, secret-spots-and-vibes.sql, and events.sql. Safe to re-run.
-- Private events are not returned by ordinary selects unless you host them, RSVPed, or checked in.
-- A friend with the invite link loads the event through fetch_event(id, token).

alter table public.space_events add column if not exists host_user_id uuid references auth.users(id) on delete set null;
alter table public.space_events add column if not exists visibility text not null default 'public';
alter table public.space_events add column if not exists invite_token text;
alter table public.space_events add column if not exists description text;
alter table public.space_events add column if not exists capacity integer;
alter table public.space_events add column if not exists allow_over_capacity boolean not null default false;
alter table public.space_events add column if not exists theme text not null default 'indigo';

alter table public.space_events drop constraint if exists space_events_theme_check;
alter table public.space_events add constraint space_events_theme_check
  check (theme in ('indigo', 'sunset', 'night', 'court', 'cafe', 'grove'));
alter table public.space_events add column if not exists cancelled_at timestamptz;

alter table public.space_events drop constraint if exists space_events_source_type_check;
alter table public.space_events add constraint space_events_source_type_check
  check (source_type in ('rating', 'space', 'hosted'));

alter table public.space_events drop constraint if exists space_events_visibility_check;
alter table public.space_events add constraint space_events_visibility_check
  check (visibility in ('public', 'private'));

alter table public.space_events drop constraint if exists space_events_description_check;
alter table public.space_events add constraint space_events_description_check
  check (description is null or char_length(description) <= 800);

alter table public.space_events drop constraint if exists space_events_capacity_check;
alter table public.space_events add constraint space_events_capacity_check
  check (capacity is null or (capacity >= 1 and capacity <= 500));

alter table public.space_events drop constraint if exists space_events_hosted_shape_check;
alter table public.space_events add constraint space_events_hosted_shape_check
  check (
    source_type <> 'hosted'
    or (
      host_user_id is not null
      and kind = 'one_time'
      and event_date is not null
      and invite_token is not null
    )
  );

create unique index if not exists space_events_invite_token_idx
  on public.space_events (invite_token) where invite_token is not null;
create index if not exists space_events_host_idx on public.space_events (host_user_id) where host_user_id is not null;
create index if not exists space_events_visibility_date_idx on public.space_events (visibility, event_date);

-- RSVPs and check-ins are per occurrence so a weekly trivia night gets a fresh headcount each week.
create table if not exists public.event_rsvps (
  event_id uuid not null references public.space_events(id) on delete cascade,
  occurrence_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going',
  created_at timestamptz not null default now(),
  primary key (event_id, occurrence_date, user_id)
);

-- Upgrade RSVPs created before occurrence_date existed. Those were all one-time hosted events.
alter table public.event_rsvps add column if not exists occurrence_date date;
update public.event_rsvps r set occurrence_date = e.event_date
  from public.space_events e
  where r.event_id = e.id and r.occurrence_date is null and e.event_date is not null;
delete from public.event_rsvps where occurrence_date is null;
alter table public.event_rsvps alter column occurrence_date set not null;
alter table public.event_rsvps drop constraint if exists event_rsvps_pkey;
alter table public.event_rsvps add constraint event_rsvps_pkey primary key (event_id, occurrence_date, user_id);

alter table public.event_rsvps drop constraint if exists event_rsvps_status_check;
alter table public.event_rsvps add constraint event_rsvps_status_check
  check (status in ('going', 'not_going'));

create index if not exists event_rsvps_user_idx on public.event_rsvps (user_id);

alter table public.event_rsvps enable row level security;

-- "I'm here" is separate from "going": you can show up without RSVPing, and RSVPing doesn't mean you came.
create table if not exists public.event_checkins (
  event_id uuid not null references public.space_events(id) on delete cascade,
  occurrence_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, occurrence_date, user_id)
);

create index if not exists event_checkins_user_idx on public.event_checkins (user_id);

alter table public.event_checkins enable row level security;

-- Security definer so event and RSVP policies can see each other without recursing.
create or replace function public.can_read_event(target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  event_row public.space_events;
  spot public.spaces;
begin
  select * into event_row from public.space_events where id = target_id;
  if not found or event_row.cancelled_at is not null then
    return false;
  end if;

  if event_row.host_user_id is not null and event_row.host_user_id = auth.uid() then
    return true;
  end if;

  if auth.uid() is not null and (
    exists (select 1 from public.event_rsvps r where r.event_id = event_row.id and r.user_id = auth.uid())
    or exists (select 1 from public.event_checkins c where c.event_id = event_row.id and c.user_id = auth.uid())
  ) then
    return true;
  end if;

  if event_row.visibility <> 'public' then
    return false;
  end if;

  select * into spot from public.spaces where id = event_row.space_id;
  if not found then
    return false;
  end if;

  return not spot.is_secret
    or spot.created_by = auth.uid()
    or public.has_secret_spot_access(spot.id);
end;
$$;

-- One-time events only have their own date. Weekly events take the requested date if it falls on the
-- right weekday, otherwise the next one from today.
create or replace function public.resolve_event_occurrence(event_row public.space_events, occurrence date)
returns date
language plpgsql
stable
set search_path = public
as $$
begin
  if event_row.kind = 'one_time' then
    return event_row.event_date;
  end if;
  if occurrence is not null and extract(dow from occurrence)::int = event_row.weekday then
    return occurrence;
  end if;
  return current_date + ((event_row.weekday - extract(dow from current_date)::int + 7) % 7);
end;
$$;

-- Not granted to clients: it ignores visibility and is only called from security definer functions.
create or replace function public.event_people(target_id uuid, occurrence date, which text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(p.id, people.user_id),
    'user_id', people.user_id,
    'username', p.username,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'location', p.location,
    'vibe_title', p.vibe_title,
    'created_at', coalesce(p.created_at, people.created_at),
    'updated_at', coalesce(p.updated_at, people.created_at)
  ) order by people.created_at), '[]'::jsonb)
  from (
    select r.user_id, r.created_at from public.event_rsvps r
    where which = 'going' and r.event_id = target_id and r.occurrence_date = occurrence and r.status = 'going'
    union all
    select c.user_id, c.created_at from public.event_checkins c
    where which = 'here' and c.event_id = target_id and c.occurrence_date = occurrence
  ) people
  left join public.profiles p on p.user_id = people.user_id;
$$;

revoke execute on function public.event_people(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.resolve_event_occurrence(public.space_events, date) from public, anon, authenticated;

drop function if exists public.fetch_event(uuid, text);

create or replace function public.fetch_event(target_id uuid, token text default null, occurrence date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  event_row public.space_events;
  spot public.spaces;
  allowed boolean;
  occ date;
begin
  select * into event_row from public.space_events where id = target_id;
  if not found then
    return null;
  end if;

  if event_row.cancelled_at is not null and event_row.host_user_id is distinct from auth.uid() then
    return null;
  end if;

  select * into spot from public.spaces where id = event_row.space_id;
  if not found then
    return null;
  end if;

  allowed := public.can_read_event(event_row.id)
    or (event_row.cancelled_at is not null and event_row.host_user_id = auth.uid())
    or (token is not null and token <> '' and token = event_row.invite_token);

  if not allowed then
    return null;
  end if;

  occ := public.resolve_event_occurrence(event_row, occurrence);

  return jsonb_build_object(
    'event', to_jsonb(event_row),
    'space', to_jsonb(spot),
    'occurrence_date', occ,
    'host', (
      select jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'username', p.username,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'location', p.location,
        'vibe_title', p.vibe_title,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.profiles p
      where p.user_id = event_row.host_user_id
    ),
    'going', public.event_people(event_row.id, occ, 'going'),
    'here', public.event_people(event_row.id, occ, 'here'),
    'viewer_status', (
      select r.status from public.event_rsvps r
      where r.event_id = event_row.id and r.occurrence_date = occ and r.user_id = auth.uid()
    ),
    'viewer_here', exists (
      select 1 from public.event_checkins c
      where c.event_id = event_row.id and c.occurrence_date = occ and c.user_id = auth.uid()
    )
  );
end;
$$;

drop function if exists public.set_event_rsvp(uuid, boolean, text);
drop function if exists public.set_event_rsvp(uuid, text, text);

-- rsvp_status: 'going', 'not_going', or null to clear the RSVP. Works for hosted and mentioned events.
create or replace function public.set_event_rsvp(
  target_id uuid,
  rsvp_status text,
  token text default null,
  occurrence date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.space_events;
  allowed boolean;
  headcount integer;
  occ date;
begin
  if auth.uid() is null then
    raise exception 'Sign in to RSVP';
  end if;

  select * into event_row from public.space_events where id = target_id;
  if not found or event_row.cancelled_at is not null then
    raise exception 'Event not found';
  end if;

  allowed := public.can_read_event(event_row.id)
    or (token is not null and token <> '' and token = event_row.invite_token);

  if not allowed then
    raise exception 'You need an invite to RSVP';
  end if;

  if rsvp_status is not null and rsvp_status not in ('going', 'not_going') then
    raise exception 'Unknown RSVP status';
  end if;

  occ := public.resolve_event_occurrence(event_row, occurrence);
  -- One day of slack because current_date is UTC and the event date is local to the spot.
  if rsvp_status is not null and occ < current_date - 1 then
    raise exception 'This event already happened';
  end if;

  if rsvp_status = 'going' and event_row.capacity is not null and not event_row.allow_over_capacity then
    -- Lock the event row so two last-spot RSVPs can't both get in.
    perform 1 from public.space_events where id = target_id for update;
    select count(*) into headcount
    from public.event_rsvps
    where event_id = target_id and occurrence_date = occ and status = 'going' and user_id <> auth.uid();
    if headcount >= event_row.capacity then
      raise exception 'This event is full';
    end if;
  end if;

  if rsvp_status is null then
    delete from public.event_rsvps where event_id = target_id and occurrence_date = occ and user_id = auth.uid();
  else
    insert into public.event_rsvps (event_id, occurrence_date, user_id, status)
    values (target_id, occ, auth.uid(), rsvp_status)
    on conflict (event_id, occurrence_date, user_id) do update set status = excluded.status;
  end if;

  select count(*) into headcount
  from public.event_rsvps
  where event_id = target_id and occurrence_date = occ and status = 'going';
  return headcount;
end;
$$;

-- The app only offers "I'm here" during the live window; the server allows a day either side for timezones.
create or replace function public.set_event_checkin(
  target_id uuid,
  is_here boolean,
  token text default null,
  occurrence date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.space_events;
  allowed boolean;
  headcount integer;
  occ date;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check in';
  end if;

  select * into event_row from public.space_events where id = target_id;
  if not found or event_row.cancelled_at is not null then
    raise exception 'Event not found';
  end if;

  allowed := public.can_read_event(event_row.id)
    or (token is not null and token <> '' and token = event_row.invite_token);

  if not allowed then
    raise exception 'You need an invite to check in';
  end if;

  occ := public.resolve_event_occurrence(event_row, occurrence);

  if is_here then
    if abs(occ - current_date) > 1 then
      raise exception 'You can only check in while it is happening';
    end if;
    insert into public.event_checkins (event_id, occurrence_date, user_id)
    values (target_id, occ, auth.uid())
    on conflict do nothing;
  else
    delete from public.event_checkins where event_id = target_id and occurrence_date = occ and user_id = auth.uid();
  end if;

  select count(*) into headcount
  from public.event_checkins
  where event_id = target_id and occurrence_date = occ;
  return headcount;
end;
$$;

grant execute on function public.can_read_event(uuid) to anon, authenticated;
grant execute on function public.fetch_event(uuid, text, date) to anon, authenticated;
grant execute on function public.set_event_rsvp(uuid, text, text, date) to authenticated;
grant execute on function public.set_event_checkin(uuid, boolean, text, date) to authenticated;

grant select on public.space_events to anon, authenticated;
grant insert, update on public.space_events to authenticated;
grant select on public.event_rsvps to anon, authenticated;
revoke insert, update on public.event_rsvps from authenticated;
grant delete on public.event_rsvps to authenticated;
grant select on public.event_checkins to anon, authenticated;
revoke insert, update, delete on public.event_checkins from authenticated;

drop policy if exists "public events are readable" on public.space_events;
drop policy if exists "events are readable" on public.space_events;
create policy "events are readable" on public.space_events
  for select using (public.can_read_event(id));

drop policy if exists "users can add extracted events" on public.space_events;
create policy "users can add extracted events" on public.space_events
  for insert with check (
    auth.uid() is not null
    and source_type in ('rating', 'space')
    and host_user_id is null
    and visibility = 'public'
    and (source_user_id is null or source_user_id = auth.uid())
    and exists (select 1 from public.spaces s where s.id = space_id and not s.is_secret)
  );

drop policy if exists "hosts can create events" on public.space_events;
create policy "hosts can create events" on public.space_events
  for insert with check (
    auth.uid() is not null
    and source_type = 'hosted'
    and host_user_id = auth.uid()
    and (source_user_id is null or source_user_id = auth.uid())
    and cancelled_at is null
    and exists (
      select 1 from public.spaces s
      where s.id = space_id
      and (
        not s.is_secret
        or s.created_by = auth.uid()
        or public.has_secret_spot_access(s.id)
      )
    )
  );

drop policy if exists "hosts can update own events" on public.space_events;
create policy "hosts can update own events" on public.space_events
  for update using (host_user_id = auth.uid() and source_type = 'hosted')
  with check (host_user_id = auth.uid() and source_type = 'hosted');

drop policy if exists "rsvps are readable with the event" on public.event_rsvps;
create policy "rsvps are readable with the event" on public.event_rsvps
  for select using (public.can_read_event(event_id));

-- RSVPs are written through set_event_rsvp so the capacity check can't be skipped.
drop policy if exists "users can rsvp to visible hosted events" on public.event_rsvps;

drop policy if exists "users can cancel own rsvp" on public.event_rsvps;
create policy "users can cancel own rsvp" on public.event_rsvps
  for delete using (auth.uid() = user_id);

-- Check-ins are written through set_event_checkin so the date window can't be skipped.
drop policy if exists "checkins are readable with the event" on public.event_checkins;
create policy "checkins are readable with the event" on public.event_checkins
  for select using (public.can_read_event(event_id));
