-- Fixes "permission denied for table secret_spot_access" for signed-out visitors.
-- Only needed if secret-spots-and-vibes.sql was run before this fix was added to it.

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

drop policy if exists "spaces are readable" on public.spaces;
create policy "spaces are readable" on public.spaces for select using (
  not is_secret
  or created_by = auth.uid()
  or public.has_secret_spot_access(id)
);
