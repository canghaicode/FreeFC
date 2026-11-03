-- 用 RPC 获取球员平均评分，规避视图未被 PostgREST schema 缓存识别的问题
CREATE OR REPLACE FUNCTION public.get_player_avg_ratings(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
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
    GROUP BY rated_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_avg_ratings(uuid[]) TO authenticated, anon;