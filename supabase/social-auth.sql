-- Profile creation that works for Apple, Google, and Facebook sign-ins.
-- Usernames get a numeric suffix on collision so a duplicate email prefix can't block sign-up.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_username text;
  candidate text;
  suffix integer := 0;
begin
  base_username := lower(regexp_replace(
    coalesce(
      meta ->> 'username',
      meta ->> 'preferred_username',
      meta ->> 'user_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    '[^a-zA-Z0-9_]', '', 'g'
  ));

  if base_username is null or base_username = '' then
    base_username := 'explorer';
  end if;

  base_username := left(base_username, 24);
  candidate := base_username;

  while exists (select 1 from profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  insert into profiles (user_id, username, full_name, avatar_url)
  values (
    new.id,
    candidate,
    coalesce(meta ->> 'full_name', meta ->> 'name', base_username),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
