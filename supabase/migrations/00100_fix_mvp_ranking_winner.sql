-- 修复 mvp_ranking 每场 MVP 取值：原窗口函数 PARTITION BY v.activity_id
-- 使 count(*) 对同场所有候选人恒等，DISTINCT ON 实际按随机行取值。
-- 改为按 (场次, 候选人) 分区统计每人得票，再取每场最高（并列取最早得票者）。
DROP VIEW IF EXISTS public.mvp_ranking;
CREATE VIEW public.mvp_ranking AS
SELECT
  a.season_id,
  a.match_format,
  mv.user_id,
  p.nickname,
  p.avatar_url,
  p.jersey_number,
  p.preferred_position AS "position",
  count(*)::integer AS mvp_votes
FROM (
  SELECT DISTINCT ON (v.activity_id) v.activity_id, v.candidate_id AS user_id
  FROM public.match_votes v
  JOIN public.activities a ON a.id = v.activity_id AND a.cancelled = false AND a.activity_time <= now()
  WHERE v.kind = 'mvp'
  ORDER BY v.activity_id,
    count(*) OVER (PARTITION BY v.activity_id, v.candidate_id) DESC,
    min(v.created_at) OVER (PARTITION BY v.activity_id, v.candidate_id) ASC
) mv
JOIN public.activities a ON a.id = mv.activity_id AND a.cancelled = false AND a.activity_time <= now()
JOIN public.profiles p ON p.id = mv.user_id
GROUP BY a.season_id, a.match_format, mv.user_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;
GRANT SELECT ON public.mvp_ranking TO anon, authenticated;
