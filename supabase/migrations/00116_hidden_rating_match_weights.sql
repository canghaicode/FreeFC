-- 隐藏分仍按场计算，但单边场不再按 100% 进入跨场平均。
-- 同场两组都有：场分 = 管理员均分×0.7 + 队员均分×0.3，这场权重 1。
-- 只有管理员：场分是管理员均分，这场权重 0.7。
-- 只有队员：场分是队员均分，这场权重 0.3。
-- 最近 10 场按权重平均。全是同一类场时权重约掉，结果仍是场次等权平均。
-- 分队估计分继续把这个新的原始隐藏分按原证据规则向 6.0 收缩，不另改口径。

CREATE OR REPLACE VIEW public.hidden_player_rating_summary AS
WITH ranked AS (
  SELECT s.*,
    CASE
      WHEN s.admin_rating_count > 0 AND s.player_rating_count > 0 THEN 1.0
      WHEN s.admin_rating_count > 0 THEN 0.7
      ELSE 0.3
    END::numeric AS match_weight,
    row_number() OVER (PARTITION BY s.rated_id ORDER BY s.ended_at DESC, s.activity_id DESC) AS rn
  FROM public.post_match_rating_activity_scores s
), recent AS (
  SELECT * FROM ranked WHERE rn <= 10
), aggregated AS (
  SELECT rated_id AS user_id,
    (sum(match_score * match_weight) / sum(match_weight))::numeric AS hidden_rating_raw,
    count(*)::integer AS match_count,
    count(*) FILTER (WHERE admin_rating_count > 0)::integer AS admin_match_count,
    sum(admin_rating_count)::integer AS admin_rating_count,
    sum(player_rating_count)::integer AS player_rating_count,
    min(ended_at) AS first_match_at,
    max(ended_at) AS last_match_at
  FROM recent
  GROUP BY rated_id
)
SELECT user_id,
  round(hidden_rating_raw, 1) AS hidden_rating,
  match_count,
  admin_match_count,
  admin_rating_count,
  player_rating_count,
  (admin_rating_count + player_rating_count)::integer AS rating_count,
  first_match_at,
  last_match_at,
  round(
    6.0 + (hidden_rating_raw - 6.0)
      * LEAST(1.0, (admin_match_count + (match_count - admin_match_count) * 0.3) / 3.0),
    3
  ) AS split_rating
FROM aggregated;

REVOKE ALL ON public.hidden_player_rating_summary FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
