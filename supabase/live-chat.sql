-- A here-chat for people checked in, and private messages between two people.
-- Run after hosted-events.sql and event-chat.sql. Safe to re-run.
-- The here chat is only for people who tapped "I'm here". The app stops showing it when the
-- hangout's live window ends, and this purge removes the rows once that date has passed.

create table if not exists public.here_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.space_events(id) on delete cascade,
  occurrence_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.here_messages drop constraint if exists here_messages_body_check;
alter table public.here_messages add constraint here_messages_body_check
  check (char_length(btrim(body)) between 1 and 1000);

create index if not exists here_messages_thread_idx
  on public.here_messages (event_id, occurrence_date, created_at);

alter table public.here_messages enable row level security;

create or replace function public.can_access_here_chat(target_id uuid, occurrence date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or occurrence is null then
    return false;
  end if;
  if occurrence < current_date - 1 or occurrence > current_date then
    return false;
  end if;
  if not exists (
    select 1 from public.space_events event
    where event.id = target_id and event.cancelled_at is null
  ) then
    return false;
  end if;
  return exists (
    select 1 from public.event_checkins checkin
    where checkin.event_id = target_id
      and checkin.occurrence_date = occurrence
      and checkin.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.can_access_here_chat(uuid, date) to authenticated;
grant select, insert on public.here_messages to authenticated;
revoke update, delete on public.here_messages from authenticated;
revoke all on public.here_messages from anon;

drop policy if exists "checked-in people can read the here chat" on public.here_messages;
create policy "checked-in people can read the here chat" on public.here_messages
  for select using (public.can_access_here_chat(event_id, occurrence_date));

drop policy if exists "checked-in people can send to the here chat" on public.here_messages;
create policy "checked-in people can send to the here chat" on public.here_messages
  for insert with check (
    user_id = auth.uid()
    and public.can_access_here_chat(event_id, occurrence_date)
  );

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(btrim(body)) between 1 and 1000);

create index if not exists direct_messages_pair_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_inbox_idx
  on public.direct_messages (recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

grant select, insert on public.direct_messages to authenticated;
revoke update, delete on public.direct_messages from authenticated;
revoke all on public.direct_messages from anon;

drop policy if exists "people can read their private messages" on public.direct_messages;
create policy "people can read their private messages" on public.direct_messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Who you can private-message: a mutual follow, someone in a group with you, anyone on an
-- invite either of you sent, anyone who shared a hangout (host, going, or checked in), or
-- someone you already have a thread with.
create or replace function public.list_messageable_people()
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select distinct person
  from (
    select follow_out.following_id as person
    from public.follows follow_out
    join public.follows follow_back
      on follow_back.follower_id = follow_out.following_id
     and follow_back.following_id = auth.uid()
    where follow_out.follower_id = auth.uid()
    union
    select event.host_user_id
    from public.space_events event
    where event.host_user_id is not null
      and event.id in (
        select hosted.id from public.space_events hosted where hosted.host_user_id = auth.uid()
        union
        select rsvp.event_id from public.event_rsvps rsvp where rsvp.user_id = auth.uid() and rsvp.status = 'going'
        union
        select checkin.event_id from public.event_checkins checkin where checkin.user_id = auth.uid()
      )
    union
    select rsvp.user_id
    from public.event_rsvps rsvp
    where rsvp.status = 'going'
      and rsvp.event_id in (
        select hosted.id from public.space_events hosted where hosted.host_user_id = auth.uid()
        union
        select mine.event_id from public.event_rsvps mine where mine.user_id = auth.uid() and mine.status = 'going'
        union
        select checkin.event_id from public.event_checkins checkin where checkin.user_id = auth.uid()
      )
    union
    select checkin.user_id
    from public.event_checkins checkin
    where checkin.event_id in (
      select hosted.id from public.space_events hosted where hosted.host_user_id = auth.uid()
      union
      select mine.event_id from public.event_rsvps mine where mine.user_id = auth.uid() and mine.status = 'going'
      union
      select mine.event_id from public.event_checkins mine where mine.user_id = auth.uid()
    )
    union
    select case when message.sender_id = auth.uid() then message.recipient_id else message.sender_id end
    from public.direct_messages message
    where message.sender_id = auth.uid() or message.recipient_id = auth.uid()
  ) people(person)
  where person is not null and person <> auth.uid();

  if to_regclass('public.group_members') is not null then
    return query execute $sql$
      select member.user_id
      from public.group_members mine
      join public.group_members member on member.group_id = mine.group_id
      where mine.user_id = auth.uid() and member.user_id <> auth.uid()
    $sql$;
  end if;

  if to_regclass('public.group_invites') is not null then
    return query execute $sql$
      select case when invite.invitee_user_id = auth.uid() then invite.invited_by else invite.invitee_user_id end
      from public.group_invites invite
      where invite.invitee_user_id = auth.uid() or invite.invited_by = auth.uid()
    $sql$;
  end if;

  if to_regclass('public.event_invites') is not null then
    return query execute $sql$
      select case when invite.invitee_user_id = auth.uid() then invite.invited_by else invite.invitee_user_id end
      from public.event_invites invite
      where invite.invitee_user_id = auth.uid() or invite.invited_by = auth.uid()
    $sql$;
  end if;
end;
$$;

create or replace function public.can_message_user(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select other_user is not null
    and other_user <> auth.uid()
    and exists (
      select 1 from public.list_messageable_people() people where people.user_id = other_user
    );
$$;

grant execute on function public.list_messageable_people() to authenticated;
grant execute on function public.can_message_user(uuid) to authenticated;

drop policy if exists "people can send private messages" on public.direct_messages;
create policy "people can send private messages" on public.direct_messages
  for insert with check (
    auth.uid() = sender_id
    and public.can_message_user(recipient_id)
  );

create or replace function public.purge_expired_here_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.here_messages where occurrence_date < current_date returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.purge_expired_here_messages() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'here_messages'
    ) then
    alter publication supabase_realtime add table public.here_messages;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
    ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-here-messages';
    perform cron.schedule('purge-expired-here-messages', '20 9 * * *', 'select public.purge_expired_here_messages()');
  end if;
end;
$$;
