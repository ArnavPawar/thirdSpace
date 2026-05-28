create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  primary_purpose text,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  description text,
  website text,
  phone text,
  hours text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.space_attributes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null unique references public.spaces(id) on delete cascade,
  category text not null,
  primary_purpose text not null,
  attribute_scores jsonb not null default '{}'::jsonb,
  overall_score integer not null default 0 check (overall_score >= 0 and overall_score <= 100),
  total_ratings integer not null default 0 check (total_ratings >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  category text not null,
  primary_purpose text not null,
  attribute_scores jsonb not null,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  review_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.ratings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rating_likes (
  rating_id uuid not null references public.ratings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rating_id, user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.user_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  personal_rank integer not null default 999 check (personal_rank > 0),
  notes text,
  is_favorite boolean not null default false,
  last_visited timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, space_id)
);

create index if not exists spaces_category_idx on public.spaces(category);
create index if not exists spaces_location_idx on public.spaces(latitude, longitude);
create index if not exists ratings_space_created_idx on public.ratings(space_id, created_at desc);
create index if not exists ratings_user_created_idx on public.ratings(user_id, created_at desc);
create index if not exists comments_rating_created_idx on public.review_comments(rating_id, created_at desc);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.spaces to anon, authenticated;
grant select on public.space_attributes to anon, authenticated;
grant select on public.ratings to anon, authenticated;
grant select on public.review_comments to anon, authenticated;
grant select on public.rating_likes to anon, authenticated;
grant select on public.follows to anon, authenticated;
grant select on public.user_rankings to anon, authenticated;

grant insert, update, delete on public.profiles to authenticated;
grant insert, update on public.spaces to authenticated;
grant insert, update, delete on public.space_attributes to authenticated;
grant insert, delete on public.ratings to authenticated;
grant insert, delete on public.review_comments to authenticated;
grant insert, delete on public.rating_likes to authenticated;
grant insert, delete on public.follows to authenticated;
grant insert, update, delete on public.user_rankings to authenticated;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_attributes enable row level security;
alter table public.ratings enable row level security;
alter table public.review_comments enable row level security;
alter table public.rating_likes enable row level security;
alter table public.follows enable row level security;
alter table public.user_rankings enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

create policy "spaces are readable" on public.spaces for select using (true);
create policy "authenticated users can add spaces" on public.spaces for insert with check (auth.uid() is not null);
create policy "authenticated users can update spaces" on public.spaces for update using (auth.uid() is not null);

create policy "space attributes are readable" on public.space_attributes for select using (true);
create policy "authenticated users can maintain attributes" on public.space_attributes for all using (auth.uid() is not null);

create policy "ratings are readable" on public.ratings for select using (true);
create policy "users can insert own ratings" on public.ratings for insert with check (auth.uid() = user_id);
create policy "users can delete own ratings" on public.ratings for delete using (auth.uid() = user_id);

create policy "comments are readable" on public.review_comments for select using (true);
create policy "users can add own comments" on public.review_comments for insert with check (auth.uid() = user_id);
create policy "users can delete own comments" on public.review_comments for delete using (auth.uid() = user_id);

create policy "likes are readable" on public.rating_likes for select using (true);
create policy "users can add own likes" on public.rating_likes for insert with check (auth.uid() = user_id);
create policy "users can remove own likes" on public.rating_likes for delete using (auth.uid() = user_id);

create policy "follows are readable" on public.follows for select using (true);
create policy "users can follow" on public.follows for insert with check (auth.uid() = follower_id);
create policy "users can unfollow" on public.follows for delete using (auth.uid() = follower_id);

create policy "rankings are readable" on public.user_rankings for select using (true);
create policy "users can add own rankings" on public.user_rankings for insert with check (auth.uid() = user_id);
create policy "users can update own rankings" on public.user_rankings for update using (auth.uid() = user_id);
create policy "users can delete own rankings" on public.user_rankings for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
