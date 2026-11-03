-- ============ v40：活动取消机制 + 出场次数改为已结算口径 ============

-- 1. activities：新增取消状态（取消的活动永不结算、不计出场、不发奖励）
ALTER TABLE public.activities ADD COLUMN cancelled boolean NOT NULL DEFAULT false;

-- 2. 重建 season_stats：出场/进球/助攻只统计「已结算且未取消」的活动
--    （报名未完赛、未结算、已取消的活动一律不计入出场榜/射手榜/助攻榜）
CREATE OR REPLACE VIEW public.season_stats AS
SELECT a.season_id,
  r.user_id,
  p.nickname,
  p.avatar_url,
  p.jersey_number,
  p.preferred_position AS position,
  count(r.id)::integer AS appearances,
  COALESCE(sum(ms.goals), 0::bigint)::integer AS goals,
  COALESCE(sum(ms.assists), 0::bigint)::integer AS assists
FROM registrations r
  JOIN activities a ON a.id = r.activity_id AND a.settled = true AND a.cancelled = false
  JOIN profiles p ON p.id = r.user_id
  LEFT JOIN match_stats ms ON ms.activity_id = r.activity_id AND ms.user_id = r.user_id
GROUP BY a.season_id, r.user_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;

-- 3. 重建 member_growth：出场/进球/助攻同步改为已结算口径（火力值随之联动）
CREATE OR REPLACE VIEW public.member_growth AS
WITH base AS (
  SELECT p.id,
    p.nickname,
    p.avatar_url,
    p.jersey_number,
    p.preferred_position,
    p.role,
    p.activity,
    CASE
      WHEN p.activity >= 3000 THEN 5
      WHEN p.activity >= 1500 THEN 4
      WHEN p.activity >= 700 THEN 3
      WHEN p.activity >= 300 THEN 2
      ELSE 1
    END AS level,
    COALESCE(ss.appearances, 0) AS appearances,
    COALESCE(ms.goals, 0) AS goals,
    COALESCE(ms.assists, 0) AS assists,
    COALESCE(dv.def_votes, 0) AS def_votes
  FROM profiles p
  LEFT JOIN (
    SELECT r.user_id, count(r.id)::integer AS appearances
    FROM registrations r
    JOIN activities a ON a.id = r.activity_id AND a.settled = true AND a.cancelled = false
    GROUP BY r.user_id
  ) ss ON ss.user_id = p.id
  LEFT JOIN (
    SELECT ms.user_id, sum(ms.goals)::integer AS goals, sum(ms.assists)::integer AS assists
    FROM match_stats ms
    JOIN activities a ON a.id = ms.activity_id AND a.settled = true AND a.cancelled = false
    GROUP BY ms.user_id
  ) ms ON ms.user_id = p.id
  LEFT JOIN (
    SELECT candidate_id, sum(points)::integer AS def_votes
    FROM defender_votes
    GROUP BY candidate_id
  ) dv ON dv.candidate_id = p.id
)
SELECT id, nickname, avatar_url, jersey_number, preferred_position, role, activity, level,
  appearances, goals, assists, def_votes,
  (activity::numeric * 0.3) + (appearances * 40)::numeric + (level * 80)::numeric
    + (goals * 30)::numeric + (assists * 20)::numeric + (def_votes * 25)::numeric AS firepower
FROM base;

-- 4. 结算 RPC：已取消的活动直接跳过（幂等返回，不结算不发奖）
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
BEGIN
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND settled = true) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND cancelled = true) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

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

  -- 最佳防守当选者：投票最高得票者；无人投票则为空
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
    IF v_mvp IS NOT NULL AND r.id = ANY(v_mvp) THEN
      v_bonus_exp := v_bonus_exp + v_cfg.mvp_exp;
      v_bonus_act := v_bonus_act + v_cfg.mvp_activity;
    END IF;
    IF v_defender IS NOT NULL AND r.id = ANY(v_defender) THEN
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

  UPDATE public.activities SET settled = true WHERE id = p_activity_id;
END $function$;

-- 5. 自动结算定时任务：跳过已取消活动（同名任务覆盖原调度）
SELECT cron.schedule(
  'auto-settle-activities',
  '*/5 * * * *',
  $$
  SELECT public.settle_activity_activity(a.id)
  FROM public.activities a
  WHERE a.settled = false
    AND a.cancelled = false
    AND a.end_time IS NOT NULL
    AND now() >= a.end_time + interval '12 hours';
  $$
);
