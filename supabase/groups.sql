-- Groups (crews): shared membership, a members' map and feed, and hangouts posted to a group.
-- Run after schema.sql, events.sql, and hosted-events.sql. Safe to re-run.
-- This replaces can_read_event. If you re-run hosted-events.sql, run this file again.

create extension if not exists "pgcrypto";

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  visibility text not null default 'private',
  invite_token text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups drop constraint if exists groups_name_check;
alter table public.groups add constraint groups_name_check
  check (char_length(trim(name)) between 1 and 60);

alter table public.groups drop constraint if exists groups_description_check;
alter table public.groups add constraint groups_description_check
  check (description is null or char_length(description) <= 280);

alter table public.groups drop constraint if exists groups_visibility_check;
alter table public.groups add constraint groups_visibility_check
  check (visibility in ('public', 'private'));

create unique index if not exists groups_invite_token_idx
  on public.groups (invite_token) where invite_token is not null;
create index if not exists groups_visibility_created_idx
  on public.groups (visibility, created_at desc);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check
  check (role in ('owner', 'member'));

create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.event_groups (
  event_id uuid not null references public.space_events(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, group_id)
);

create index if not exists event_groups_group_idx on public.event_groups (group_id);

create table if not exists public.group_spots (
  group_id uuid not null references public.groups(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, space_id)
);

create table if not exists public.event_invites (
  event_id uuid not null references public.space_events(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (event_id, invitee_user_id)
);

alter table public.event_invites drop constraint if exists event_invites_status_check;
alter table public.event_invites add constraint event_invites_status_check
  check (status in ('pending', 'accepted', 'declined'));

create index if not exists event_invites_invitee_idx on public.event_invites (invitee_user_id, status);

create table if not exists public.group_invites (
  group_id uuid not null references public.groups(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (group_id, invitee_user_id)
);

alter table public.group_invites drop constraint if exists group_invites_status_check;
alter table public.group_invites add constraint group_invites_status_check
  check (status in ('pending', 'accepted', 'declined'));

create index if not exists group_invites_invitee_idx on public.group_invites (invitee_user_id, status);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.event_groups enable row level security;
alter table public.group_spots enable row level security;
alter table public.event_invites enable row level security;
alter table public.group_invites enable row level security;

create or replace function public.is_group_member(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members member
    where member.group_id = target_id and member.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members member
    where member.group_id = target_id and member.user_id = auth.uid() and member.role = 'owner'
  );
$$;

create or replace function public.is_event_host(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.space_events event
    where event.id = target_id and event.host_user_id = auth.uid()
  );
$$;

create or replace function public.can_see_group(target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  group_row public.groups;
begin
  select * into group_row from public.groups where id = target_id;
  if not found then
    return false;
  end if;
  if group_row.visibility = 'public' then
    return true;
  end if;
  if auth.uid() is null then
    return false;
  end if;
  if group_row.created_by = auth.uid() or public.is_group_member(target_id) then
    return true;
  end if;
  return exists (
    select 1 from public.group_invites invite
    where invite.group_id = target_id
      and invite.invitee_user_id = auth.uid()
      and invite.status in ('pending', 'accepted')
  );
end;
$$;

create or replace function public.can_read_group_content(target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  group_row public.groups;
begin
  select * into group_row from public.groups where id = target_id;
  if not found then
    return false;
  end if;
  if group_row.visibility = 'public' then
    return true;
  end if;
  return public.is_group_member(target_id);
end;
$$;

-- Keep the hosted-events rules, and also allow group members and in-app invitees.
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

  if auth.uid() is not null and exists (
    select 1 from public.event_invites invite
    where invite.event_id = event_row.id
      and invite.invitee_user_id = auth.uid()
      and invite.status in ('pending', 'accepted')
  ) then
    return true;
  end if;

  if auth.uid() is not null and exists (
    select 1
    from public.event_groups posted
    join public.group_members member on member.group_id = posted.group_id
    where posted.event_id = event_row.id
      and member.user_id = auth.uid()
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

create or replace function public.fetch_group(target_id uuid, token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  group_row public.groups;
  allowed boolean;
  viewer_role text;
begin
  select * into group_row from public.groups where id = target_id;
  if not found then
    return null;
  end if;

  allowed := public.can_see_group(target_id)
    or (token is not null and token <> '' and token = group_row.invite_token);
  if not allowed then
    return null;
  end if;

  select member.role into viewer_role
  from public.group_members member
  where member.group_id = target_id and member.user_id = auth.uid();

  if viewer_role is null then
    group_row.invite_token := null;
  end if;

  return jsonb_build_object(
    'group', to_jsonb(group_row),
    'viewer_role', viewer_role,
    'member_count', (select count(*) from public.group_members member where member.group_id = target_id),
    'invite_status', (
      select invite.status from public.group_invites invite
      where invite.group_id = target_id and invite.invitee_user_id = auth.uid()
    )
  );
end;
$$;

create or replace function public.create_group(group_name text, group_description text, group_visibility text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  group_id uuid;
  cleaned_name text := trim(group_name);
  cleaned_description text := nullif(trim(coalesce(group_description, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a group';
  end if;
  if cleaned_name is null or char_length(cleaned_name) < 1 or char_length(cleaned_name) > 60 then
    raise exception 'Give it a name, up to 60 characters.';
  end if;
  if cleaned_description is not null and char_length(cleaned_description) > 280 then
    raise exception 'Keep the description under 280 characters.';
  end if;
  if group_visibility not in ('public', 'private') then
    raise exception 'Pick public or private';
  end if;

  insert into public.groups (name, description, visibility, invite_token, created_by)
  values (cleaned_name, cleaned_description, group_visibility, replace(gen_random_uuid()::text, '-', ''), auth.uid())
  returning id into group_id;

  insert into public.group_members (group_id, user_id, role)
  values (group_id, auth.uid(), 'owner');

  return public.fetch_group(group_id, null);
end;
$$;

create or replace function public.join_group(target_id uuid, token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  group_row public.groups;
  allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a group';
  end if;

  select * into group_row from public.groups where id = target_id;
  if not found then
    raise exception 'Group not found';
  end if;

  if exists (
    select 1 from public.group_members member
    where member.group_id = target_id and member.user_id = auth.uid()
  ) then
    update public.group_invites
    set status = 'accepted'
    where group_id = target_id and invitee_user_id = auth.uid() and status = 'pending';
    return;
  end if;

  allowed := group_row.visibility = 'public'
    or (token is not null and token <> '' and token = group_row.invite_token)
    or exists (
      select 1 from public.group_invites invite
      where invite.group_id = target_id
        and invite.invitee_user_id = auth.uid()
        and invite.status = 'accepted'
    );

  if not allowed then
    raise exception 'You need an invite to join';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_id, auth.uid(), 'member');

  update public.group_invites
  set status = 'accepted'
  where group_id = target_id and invitee_user_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.leave_group(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_role text;
  next_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to leave a group';
  end if;

  select member.role into viewer_role
  from public.group_members member
  where member.group_id = target_id and member.user_id = auth.uid();

  if viewer_role is null then
    return;
  end if;

  if viewer_role = 'owner' then
    select member.user_id into next_owner
    from public.group_members member
    where member.group_id = target_id and member.user_id <> auth.uid()
    order by member.created_at asc, member.user_id asc
    limit 1;

    if next_owner is null then
      delete from public.groups where id = target_id;
      return;
    end if;

    update public.group_members set role = 'owner'
    where group_id = target_id and user_id = next_owner;
  end if;

  delete from public.group_members
  where group_id = target_id and user_id = auth.uid();
end;
$$;

create or replace function public.remove_group_member(target_id uuid, member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage this group';
  end if;
  if member_id = auth.uid() then
    raise exception 'Leave the group to remove yourself';
  end if;
  if not public.is_group_owner(target_id) then
    raise exception 'Only the owner can remove members';
  end if;

  delete from public.group_members
  where group_id = target_id and user_id = member_id and role <> 'owner';
end;
$$;

create or replace function public.invite_to_event(target_id uuid, invitee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to invite someone';
  end if;
  if invitee = auth.uid() then
    raise exception 'You are already hosting this';
  end if;
  if not public.is_event_host(target_id) then
    raise exception 'Only the host can invite people';
  end if;
  if not exists (
    select 1 from public.follows
    where follower_id = auth.uid() and following_id = invitee
  ) then
    raise exception 'You can only invite people you follow';
  end if;

  insert into public.event_invites (event_id, invitee_user_id, invited_by, status)
  values (target_id, invitee, auth.uid(), 'pending')
  on conflict (event_id, invitee_user_id) do update
    set status = 'pending',
        invited_by = excluded.invited_by,
        created_at = now()
    where public.event_invites.status = 'declined';
end;
$$;

create or replace function public.invite_to_group(target_id uuid, invitee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to invite someone';
  end if;
  if invitee = auth.uid() then
    raise exception 'You are already in this group';
  end if;
  if not public.is_group_member(target_id) then
    raise exception 'Only members can invite people';
  end if;
  if exists (
    select 1 from public.group_members member
    where member.group_id = target_id and member.user_id = invitee
  ) then
    raise exception 'They are already in the group';
  end if;
  if not exists (
    select 1 from public.follows
    where follower_id = auth.uid() and following_id = invitee
  ) then
    raise exception 'You can only invite people you follow';
  end if;

  insert into public.group_invites (group_id, invitee_user_id, invited_by, status)
  values (target_id, invitee, auth.uid(), 'pending')
  on conflict (group_id, invitee_user_id) do update
    set status = 'pending',
        invited_by = excluded.invited_by,
        created_at = now()
    where public.group_invites.status = 'declined';
end;
$$;

create or replace function public.respond_event_invite(target_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond';
  end if;
  if next_status not in ('accepted', 'declined') then
    raise exception 'Unknown invite response';
  end if;

  update public.event_invites
  set status = next_status
  where event_id = target_id and invitee_user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Invite not found';
  end if;
end;
$$;

create or replace function public.respond_group_invite(target_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond';
  end if;
  if next_status not in ('accepted', 'declined') then
    raise exception 'Unknown invite response';
  end if;

  update public.group_invites
  set status = next_status
  where group_id = target_id and invitee_user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Invite not found';
  end if;

  if next_status = 'accepted' then
    perform public.join_group(target_id, null);
  end if;
end;
$$;

grant execute on function public.can_read_event(uuid) to anon, authenticated;
grant execute on function public.fetch_group(uuid, text) to anon, authenticated;
grant execute on function public.can_see_group(uuid) to anon, authenticated;
grant execute on function public.can_read_group_content(uuid) to anon, authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_event_host(uuid) to authenticated;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.invite_to_event(uuid, uuid) to authenticated;
grant execute on function public.invite_to_group(uuid, uuid) to authenticated;
grant execute on function public.respond_event_invite(uuid, text) to authenticated;
grant execute on function public.respond_group_invite(uuid, text) to authenticated;

grant select on public.groups to anon, authenticated;
grant select on public.group_members to authenticated;
grant select, insert on public.event_groups to authenticated;
grant select, insert, delete on public.group_spots to authenticated;
grant select on public.event_invites to authenticated;
grant select on public.group_invites to authenticated;

drop policy if exists "groups are visible to members and the public" on public.groups;
create policy "groups are visible to members and the public" on public.groups
  for select using (public.can_see_group(id));

drop policy if exists "members are visible with the group" on public.group_members;
create policy "members are visible with the group" on public.group_members
  for select using (public.can_read_group_content(group_id) or user_id = auth.uid());

drop policy if exists "event posts are visible with the group" on public.event_groups;
create policy "event posts are visible with the group" on public.event_groups
  for select using (public.can_read_group_content(group_id));

drop policy if exists "hosts can post events to their groups" on public.event_groups;
create policy "hosts can post events to their groups" on public.event_groups
  for insert with check (public.is_event_host(event_id) and public.is_group_member(group_id));

drop policy if exists "spots are visible with the group" on public.group_spots;
create policy "spots are visible with the group" on public.group_spots
  for select using (public.can_read_group_content(group_id));

drop policy if exists "members can save spots" on public.group_spots;
create policy "members can save spots" on public.group_spots
  for insert with check (added_by = auth.uid() and public.is_group_member(group_id));

drop policy if exists "savers and owners can remove spots" on public.group_spots;
create policy "savers and owners can remove spots" on public.group_spots
  for delete using (added_by = auth.uid() or public.is_group_owner(group_id));

drop policy if exists "event invites are readable by the people involved" on public.event_invites;
create policy "event invites are readable by the people involved" on public.event_invites
  for select using (
    invitee_user_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_event_host(event_id)
  );

drop policy if exists "group invites are readable by the people involved" on public.group_invites;
create policy "group invites are readable by the people involved" on public.group_invites
  for select using (
    invitee_user_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_group_member(group_id)
  );
