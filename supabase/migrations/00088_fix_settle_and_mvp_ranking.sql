-- v116-1: 修复结算失败 —— 权限改为「管理员 或 活动创建者」，与前端按钮显示条件一致
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_old_exp int;
  v_new_exp int;
  v_old_lv int;
  v_new_lv int;
  v_cfg public.growth_config%ROWTYPE;
  v_mvp uuid[];
  v_defender uuid[];
  v_bonus_exp int;
  v_bonus_act int;
  v_uid uuid := auth.uid();
  v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT created_by INTO v_creator FROM public.activities WHERE id = p_activity_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '活动不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND settled = true) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND cancelled = true) THEN RETURN; END IF;

  SELECT * INTO v_cfg FROM public.growth_config WHERE id = 1;

  -- MVP 当选者：按单场「进球数 + 助攻数」总和最高者当选；无人填报数据则为空
  SELECT array_agg(user_id) INTO v_mvp FROM (
    SELECT ms.user_id, (COALESCE(ms.goals,0) + COALESCE(ms.assists,0)) AS total
    FROM public.match_stats ms
    WHERE ms.activity_id = p_activity_id
    ORDER BY total DESC, ms.created_at ASC
  ) sub
  WHERE total = (SELECT max(COALESCE(goals,0) + COALESCE(assists,0)) FROM public.match_stats WHERE activity_id = p_activity_id)
    AND total > 0;

  -- 最佳防守当选者：按单场 match_votes kind='defender' 得票最高者当选；无人投票则为空
  SELECT array_agg(candidate_id) INTO v_defender FROM (
    SELECT candidate_id, count(*) AS cnt FROM public.match_votes
      WHERE activity_id = p_activity_id AND kind = 'defender'
      GROUP BY candidate_id ORDER BY cnt DESC, min(created_at) ASC
  ) sub WHERE cnt = (SELECT max(cnt) FROM (
    SELECT count(*) AS cnt FROM public.match_votes WHERE activity_id = p_activity_id AND kind = 'defender' GROUP BY candidate_id
  ) d);

  FOR r IN
    SELECT p.id, p.exp,
      COALESCE(ms.goals, 0) AS goals,
      COALESCE(ms.assists, 0) AS assists
    FROM public.profiles p
    LEFT JOIN public.match_stats ms ON ms.user_id = p.id AND ms.activity_id = p_activity_id
    WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id AND status = 'confirmed')
  LOOP
    v_bonus_exp := 0;
    v_bonus_act := 0;
    IF r.id = ANY(v_mvp) THEN
      v_bonus_exp := v_bonus_exp + v_cfg.mvp_exp;
      v_bonus_act := v_bonus_act + v_cfg.mvp_activity;
    END IF;
    IF r.id = ANY(v_defender) THEN
      v_bonus_exp := v_bonus_exp + v_cfg.defender_exp;
      v_bonus_act := v_bonus_act + v_cfg.defender_activity;
    END IF;
    v_bonus_exp := v_bonus_exp + r.goals * v_cfg.goal_exp + r.assists * v_cfg.assist_exp;
    v_bonus_act := v_bonus_act + r.goals * v_cfg.goal_activity + r.assists * v_cfg.assist_activity;

    v_old_exp := r.exp;
    v_new_exp := r.exp + v_cfg.exp_per_match + v_bonus_exp;
    v_old_lv := floor(v_old_exp / v_cfg.exp_per_level::numeric);
    v_new_lv := floor(v_new_exp / v_cfg.exp_per_level::numeric);
    UPDATE public.profiles
    SET activity = activity + v_cfg.activity_per_match + v_bonus_act,
        exp = v_new_exp,
        free_points = free_points + GREATEST(v_new_lv - v_old_lv, 0) * v_cfg.points_per_level,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  UPDATE public.activities SET settled = true, updated_at = now() WHERE id = p_activity_id;
  RETURN;
END $function$;

-- v116-2: MVP榜改为「每场得票最高者算1次MVP」，按累计MVP次数排名（非总票数）
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
  -- 每场得票最高者（并列最高均计1次）
  SELECT DISTINCT ON (v.activity_id) v.activity_id, v.candidate_id AS user_id
  FROM public.match_votes v
  JOIN public.activities a ON a.id = v.activity_id AND a.cancelled = false AND a.activity_time <= now()
  WHERE v.kind = 'mvp'
  ORDER BY v.activity_id, count(*) OVER (PARTITION BY v.activity_id) DESC, min(v.created_at) OVER (PARTITION BY v.activity_id) ASC
) mv
JOIN public.activities a ON a.id = mv.activity_id AND a.cancelled = false AND a.activity_time <= now()
JOIN public.profiles p ON p.id = mv.user_id
GROUP BY a.season_id, a.match_format, mv.user_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;
GRANT SELECT ON public.mvp_ranking TO anon, authenticated;