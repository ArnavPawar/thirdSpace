-- Demo users inserted straight into auth.users can leave token columns null.
-- GoTrue then fails Authentication → Users with "Database error finding users".
-- Run once in the Supabase SQL editor. Safe to re-run. Missing columns are skipped.

do $$
declare
  col text;
begin
  foreach col in array array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ]
  loop
    begin
      execute format('update auth.users set %I = %L where %I is null', col, '', col);
    exception
      when undefined_column then
        null;
    end;
  end loop;
end $$;

-- SQL-inserted demo users also need an email identity or password sign-in fails.
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  users.id,
  jsonb_build_object('sub', users.id::text, 'email', users.email, 'email_verified', true),
  'email',
  users.id::text,
  now(),
  now(),
  now()
from auth.users as users
where users.email is not null
  and not exists (
    select 1 from auth.identities as identities
    where identities.user_id = users.id and identities.provider = 'email'
  );
