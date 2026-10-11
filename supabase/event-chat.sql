-- Group chats for people going to an event. Each occurrence of an event series has its own chat.
-- Run after hosted-events.sql. Safe to re-run.
-- Chats disappear the day after the event: rows stop being readable then, and purge_expired_event_messages()
-- deletes them for good (scheduled below when pg_cron is available).

create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.space_events(id) on delete cascade,
  occurrence_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.event_messages drop constraint if exists event_messages_body_check;
alter table public.event_messages add constraint event_messages_body_check
  check (char_length(btrim(body)) between 1 and 1000);

create index if not exists event_messages_thread_idx
  on public.event_messages (event_id, occurrence_date, created_at);

alter table public.event_messages enable row level security;

-- Messages belong to the event's series (see hosted-events.sql), same as RSVPs.
update public.event_messages m
set event_id = e.series_id
from public.space_events e
where e.id = m.event_id and e.series_id <> e.id;

-- The host and anyone marked going for that date are in the chat, until the day after the event.
create or replace function public.can_access_event_chat(target_id uuid, occurrence date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  event_row public.space_events;
begin
  if auth.uid() is null or occurrence is null or occurrence < current_date - 1 then
    return false;
  end if;

  select * into event_row from public.space_events where id = target_id;
  if not found or event_row.cancelled_at is not null then
    return false;
  end if;

  -- Chats live on the series anchor, so this is the same date check RSVPs use.
  if public.resolve_event_occurrence(event_row, occurrence) is distinct from occurrence then
    return false;
  end if;

  if event_row.host_user_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1 from public.event_rsvps r
    where r.event_id = target_id
      and r.occurrence_date = occurrence
      and r.user_id = auth.uid()
      and r.status = 'going'
  );
end;
$$;

grant execute on function public.can_access_event_chat(uuid, date) to authenticated;

grant select, insert on public.event_messages to authenticated;
revoke update, delete on public.event_messages from authenticated;
revoke all on public.event_messages from anon;

drop policy if exists "chat members can read messages" on public.event_messages;
create policy "chat members can read messages" on public.event_messages
  for select using (public.can_access_event_chat(event_id, occurrence_date));

drop policy if exists "chat members can send messages" on public.event_messages;
create policy "chat members can send messages" on public.event_messages
  for insert with check (
    user_id = auth.uid()
    and public.can_access_event_chat(event_id, occurrence_date)
  );

create or replace function public.purge_expired_event_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.event_messages where occurrence_date < current_date - 2 returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.purge_expired_event_messages() from public, anon, authenticated;

-- Live updates in the chat screen.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_messages'
    ) then
    alter publication supabase_realtime add table public.event_messages;
  end if;
end;
$$;

-- Nightly purge. Enable the pg_cron extension in the dashboard first; without it this is skipped.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-event-messages';
    perform cron.schedule('purge-expired-event-messages', '15 9 * * *', 'select public.purge_expired_event_messages()');
  end if;
end;
$$;
