-- Tag the friends and groups you were with on a review.
-- Run after groups.sql. Safe to re-run.
-- A group's feed uses these tags. It does not show every review a member wrote on their own.

create table if not exists public.review_companions (
  rating_id uuid not null references public.ratings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rating_id, user_id)
);

create index if not exists review_companions_user_idx on public.review_companions (user_id);

create table if not exists public.review_groups (
  rating_id uuid not null references public.ratings(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rating_id, group_id)
);

create index if not exists review_groups_group_idx on public.review_groups (group_id);

alter table public.review_companions enable row level security;
alter table public.review_groups enable row level security;

grant select on public.review_companions to anon, authenticated;
grant select on public.review_groups to anon, authenticated;
grant insert, delete on public.review_companions to authenticated;
grant insert, delete on public.review_groups to authenticated;

drop policy if exists "companions are readable" on public.review_companions;
create policy "companions are readable" on public.review_companions
  for select using (true);

drop policy if exists "authors tag people they follow" on public.review_companions;
create policy "authors tag people they follow" on public.review_companions
  for insert with check (
    user_id <> auth.uid()
    and exists (
      select 1 from public.ratings rating
      where rating.id = rating_id and rating.user_id = auth.uid()
    )
    and exists (
      select 1 from public.follows follow
      where follow.follower_id = auth.uid() and follow.following_id = user_id
    )
  );

drop policy if exists "authors and tagged people can remove a companion" on public.review_companions;
create policy "authors and tagged people can remove a companion" on public.review_companions
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ratings rating
      where rating.id = rating_id and rating.user_id = auth.uid()
    )
  );

drop policy if exists "group tags are visible with the group" on public.review_groups;
create policy "group tags are visible with the group" on public.review_groups
  for select using (
    exists (
      select 1 from public.groups crew
      where crew.id = group_id
        and (crew.visibility = 'public' or public.is_group_member(crew.id))
    )
  );

drop policy if exists "authors tag groups they belong to" on public.review_groups;
create policy "authors tag groups they belong to" on public.review_groups
  for insert with check (
    public.is_group_member(group_id)
    and exists (
      select 1 from public.ratings rating
      where rating.id = rating_id and rating.user_id = auth.uid()
    )
  );

drop policy if exists "authors can remove a group tag" on public.review_groups;
create policy "authors can remove a group tag" on public.review_groups
  for delete using (
    exists (
      select 1 from public.ratings rating
      where rating.id = rating_id and rating.user_id = auth.uid()
    )
  );
