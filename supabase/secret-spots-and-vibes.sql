-- Secret spots (Gatekeeper mode) and Vibe Identity titles.
-- Run after schema.sql. Safe to re-run.

alter table public.spaces add column if not exists is_secret boolean not null default false;
alter table public.spaces add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.spaces add column if not exists area_hint text check (area_hint is null or char_length(area_hint) <= 60);
alter table public.profiles add column if not exists vibe_title text check (vibe_title is null or char_length(vibe_title) <= 40);

create index if not exists spaces_secret_owner_idx on public.spaces(created_by) where is_secret;

create table if not exists public.secret_spot_access (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.secret_spot_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('request', 'trade')),
  offered_space_id uuid references public.spaces(id) on delete cascade,
  message text check (message is null or char_length(message) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> owner_id),
  check (kind = 'request' or offered_space_id is not null)
);

create unique index if not exists secret_requests_one_pending_idx
  on public.secret_spot_requests(space_id, requester_id)
  where status = 'pending';
create index if not exists secret_requests_owner_idx on public.secret_spot_requests(owner_id, status);

alter table public.secret_spot_access enable row level security;
alter table public.secret_spot_requests enable row level security;

grant select on public.secret_spot_access to authenticated;
grant select on public.secret_spot_requests to authenticated;

drop policy if exists "users see own secret access" on public.secret_spot_access;
create policy "users see own secret access" on public.secret_spot_access
  for select using (user_id = auth.uid());

drop policy if exists "participants see secret requests" on public.secret_spot_requests;
create policy "participants see secret requests" on public.secret_spot_requests
  for select using (requester_id = auth.uid() or owner_id = auth.uid());

-- Security definer so anon/authenticated don't need direct access to secret_spot_access.
create or replace function public.has_secret_spot_access(target_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from secret_spot_access
    where space_id = target_space and user_id = auth.uid()
  );
$$;

grant execute on function public.has_secret_spot_access(uuid) to anon, authenticated;

-- Secret spots are only readable by their owner and people who were granted access.
drop policy if exists "spaces are readable" on public.spaces;
create policy "spaces are readable" on public.spaces for select using (
  not is_secret
  or created_by = auth.uid()
  or public.has_secret_spot_access(id)
);

drop policy if exists "authenticated users can add spaces" on public.spaces;
create policy "authenticated users can add spaces" on public.spaces for insert with check (
  auth.uid() is not null and (not is_secret or created_by = auth.uid())
);

create or replace function public.protect_space_secret_settings()
returns trigger
language plpgsql
as $$
begin
  if (new.is_secret is distinct from old.is_secret or new.created_by is distinct from old.created_by)
    and old.created_by is distinct from auth.uid() then
    raise exception 'Only the owner can change secret settings';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_space_secret_settings on public.spaces;
create trigger protect_space_secret_settings
  before update on public.spaces
  for each row execute function public.protect_space_secret_settings();

-- Ratings and attributes inherit visibility from the space they belong to.
drop policy if exists "ratings are readable" on public.ratings;
create policy "ratings are readable" on public.ratings for select using (
  exists (select 1 from public.spaces s where s.id = ratings.space_id)
);

drop policy if exists "space attributes are readable" on public.space_attributes;
create policy "space attributes are readable" on public.space_attributes for select using (
  exists (select 1 from public.spaces s where s.id = space_attributes.space_id)
);

-- Teaser list: everyone can see that a secret spot exists, but locked spots only expose
-- category, owner, the owner's hint, and coordinates rounded to roughly 1km.
create or replace function public.list_secret_spots()
returns table (
  id uuid,
  category text,
  primary_purpose text,
  area_hint text,
  approx_latitude double precision,
  approx_longitude double precision,
  owner_id uuid,
  overall_score integer,
  access text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer_access as (
    select
      s.*,
      case
        when s.created_by = auth.uid() then 'owner'
        when exists (
          select 1 from secret_spot_access a where a.space_id = s.id and a.user_id = auth.uid()
        ) then 'unlocked'
        when exists (
          select 1 from secret_spot_requests r
          where r.space_id = s.id and r.requester_id = auth.uid() and r.status = 'pending'
        ) then 'pending'
        else 'locked'
      end as access_level
    from spaces s
    where s.is_secret and s.created_by is not null
  )
  select
    v.id,
    v.category,
    v.primary_purpose,
    v.area_hint,
    case when v.access_level in ('owner', 'unlocked') then v.latitude else round(v.latitude::numeric, 2)::double precision end,
    case when v.access_level in ('owner', 'unlocked') then v.longitude else round(v.longitude::numeric, 2)::double precision end,
    v.created_by,
    sa.overall_score,
    v.access_level,
    v.created_at
  from viewer_access v
  left join space_attributes sa on sa.space_id = v.id
  order by v.created_at desc;
$$;

create or replace function public.request_secret_spot(
  target_space uuid,
  offered_space uuid default null,
  note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  spot_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to request secret spots';
  end if;

  select created_by into spot_owner from spaces where id = target_space and is_secret;
  if spot_owner is null then
    raise exception 'Secret spot not found';
  end if;
  if spot_owner = auth.uid() then
    raise exception 'You already own this spot';
  end if;
  if exists (select 1 from secret_spot_access where space_id = target_space and user_id = auth.uid()) then
    return 'unlocked';
  end if;

  if offered_space is not null and not exists (
    select 1 from spaces where id = offered_space and is_secret and created_by = auth.uid()
  ) then
    raise exception 'You can only trade secret spots you own';
  end if;

  insert into secret_spot_requests (space_id, requester_id, owner_id, kind, offered_space_id, message)
  values (
    target_space,
    auth.uid(),
    spot_owner,
    case when offered_space is null then 'request' else 'trade' end,
    offered_space,
    nullif(trim(note), '')
  )
  on conflict (space_id, requester_id) where status = 'pending' do update
    set kind = excluded.kind,
        offered_space_id = excluded.offered_space_id,
        message = excluded.message,
        created_at = now();

  return 'pending';
end;
$$;

create or replace function public.respond_secret_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req secret_spot_requests;
begin
  select * into req
  from secret_spot_requests
  where id = request_id and owner_id = auth.uid() and status = 'pending'
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  update secret_spot_requests
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = request_id;

  if accept then
    insert into secret_spot_access (space_id, user_id)
    values (req.space_id, req.requester_id)
    on conflict do nothing;

    if req.kind = 'trade' and req.offered_space_id is not null then
      insert into secret_spot_access (space_id, user_id)
      values (req.offered_space_id, req.owner_id)
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke all on function public.list_secret_spots() from public;
revoke all on function public.request_secret_spot(uuid, uuid, text) from public;
revoke all on function public.respond_secret_request(uuid, boolean) from public;
grant execute on function public.list_secret_spots() to authenticated;
grant execute on function public.request_secret_spot(uuid, uuid, text) to authenticated;
grant execute on function public.respond_secret_request(uuid, boolean) to authenticated;
