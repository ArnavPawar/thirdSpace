-- Photos attached to reviews (ratings) and review comments, stored in Supabase Storage.
-- Run after schema.sql and secret-spots-and-vibes.sql. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "review photos are readable" on storage.objects;
create policy "review photos are readable" on storage.objects
  for select using (bucket_id = 'review-photos');

drop policy if exists "users upload own review photos" on storage.objects;
create policy "users upload own review photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own review photos" on storage.objects;
create policy "users delete own review photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.review_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  rating_id uuid references public.ratings(id) on delete cascade,
  comment_id uuid references public.review_comments(id) on delete cascade,
  storage_path text not null unique,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  check ((rating_id is null) <> (comment_id is null))
);

create index if not exists review_photos_space_created_idx on public.review_photos(space_id, created_at desc);
create index if not exists review_photos_rating_idx on public.review_photos(rating_id) where rating_id is not null;
create index if not exists review_photos_comment_idx on public.review_photos(comment_id) where comment_id is not null;

alter table public.review_photos enable row level security;

grant select on public.review_photos to anon, authenticated;
grant insert, delete on public.review_photos to authenticated;

-- Photos inherit visibility from the space they belong to, like ratings.
drop policy if exists "review photos rows are readable" on public.review_photos;
create policy "review photos rows are readable" on public.review_photos
  for select using (
    exists (select 1 from public.spaces s where s.id = review_photos.space_id)
  );

drop policy if exists "users add own review photos" on public.review_photos;
create policy "users add own review photos" on public.review_photos
  for insert with check (
    auth.uid() = user_id
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and (
      (rating_id is not null and exists (
        select 1 from public.ratings r
        where r.id = rating_id and r.user_id = auth.uid() and r.space_id = review_photos.space_id
      ))
      or (comment_id is not null and exists (
        select 1 from public.review_comments c
        join public.ratings r on r.id = c.rating_id
        where c.id = comment_id and c.user_id = auth.uid() and r.space_id = review_photos.space_id
      ))
    )
  );

drop policy if exists "users delete own review photos rows" on public.review_photos;
create policy "users delete own review photos rows" on public.review_photos
  for delete using (auth.uid() = user_id);
