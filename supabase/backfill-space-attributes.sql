insert into public.space_attributes (
  space_id,
  category,
  primary_purpose,
  attribute_scores,
  overall_score,
  total_ratings
)
select distinct on (rating_rollups.space_id)
  rating_rollups.space_id,
  rating_rollups.category,
  rating_rollups.primary_purpose,
  rating_rollups.attribute_scores,
  rating_rollups.overall_score,
  rating_rollups.total_ratings
from (
  select
    ratings.space_id,
    (array_agg(ratings.category order by ratings.created_at desc))[1] as category,
    (array_agg(ratings.primary_purpose order by ratings.created_at desc))[1] as primary_purpose,
    (
      select jsonb_object_agg(score_keys.key, round(score_keys.average_value::numeric, 1))
      from (
        select
          score_entries.key,
          avg((score_entries.value)::numeric) as average_value
        from public.ratings rating_entries
        cross join lateral jsonb_each_text(rating_entries.attribute_scores) as score_entries(key, value)
        where rating_entries.space_id = ratings.space_id
        group by score_entries.key
      ) score_keys
    ) as attribute_scores,
    round(avg(ratings.overall_score))::integer as overall_score,
    count(*)::integer as total_ratings
  from public.ratings
  group by ratings.space_id
) rating_rollups
on conflict (space_id) do update set
  category = excluded.category,
  primary_purpose = excluded.primary_purpose,
  attribute_scores = excluded.attribute_scores,
  overall_score = excluded.overall_score,
  total_ratings = excluded.total_ratings,
  updated_at = now();
