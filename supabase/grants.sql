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
