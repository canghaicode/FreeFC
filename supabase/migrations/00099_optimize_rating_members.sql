-- 评分汇总不计入自评；评分列表一次返回展示所需的精简资料和汇总结果。
CREATE OR REPLACE VIEW public.player_avg_ratings AS
SELECT rated_id AS user_id,
  round(avg(score)::numeric, 1) AS avg_rating,
  count(*)::integer AS rating_count
FROM public.player_ratings
WHERE rater_id <> rated_id
GROUP BY rated_id;

CREATE OR REPLACE FUNCTION public.get_player_avg_ratings(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT rated_id AS user_id,
      round(avg(score), 1) AS avg_rating,
      count(*)::integer AS rating_count
    FROM public.player_ratings
    WHERE rated_id = ANY(p_user_ids)
      AND rater_id <> rated_id
    GROUP BY rated_id
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.get_rating_members()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(t)
      ORDER BY t.avg_rating DESC NULLS LAST,
        t.jersey_number ASC NULLS LAST,
        t.id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT p.id,
      p.nickname,
      p.avatar_url,
      p.jersey_number,
      p.preferred_position,
      round(avg(r.score), 1) AS avg_rating,
      count(r.id)::integer AS rating_count
    FROM public.profiles p
    LEFT JOIN public.player_ratings r
      ON r.rated_id = p.id
      AND r.rater_id <> r.rated_id
    GROUP BY p.id
  ) t;
$$;

GRANT SELECT ON public.player_avg_ratings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_avg_ratings(uuid[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_rating_members() TO authenticated, anon;
