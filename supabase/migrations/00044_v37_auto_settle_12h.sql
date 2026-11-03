-- 启用定时任务扩展
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 活动结算状态字段
ALTER TABLE public.activities ADD COLUMN settled boolean NOT NULL DEFAULT false;

-- 重写结算 RPC：幂等，已结算则跳过；由 MVP/最佳防守投票最高得票者当选
DROP FUNCTION IF EXISTS public.settle_activity_activity(uuid);
CREATE FUNCTION public.settle_activity_activity(p_activity_id uuid)
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
  -- 幂等：已结算则直接返回
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND settled = true) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  SELECT * INTO v_cfg FROM public.growth_config WHERE id = 1;

  -- MVP 当选者：最高得票，并列均当选
  SELECT array_agg(candidate_id) INTO v_mvp FROM (
    SELECT candidate_id, count(*) AS cnt FROM public.match_votes
      WHERE activity_id = p_activity_id AND kind = 'mvp'
      GROUP BY candidate_id ORDER BY cnt DESC, min(created_at) ASC
  ) sub WHERE cnt = (SELECT max(cnt) FROM (
    SELECT count(*) AS cnt FROM public.match_votes WHERE activity_id = p_activity_id AND kind = 'mvp' GROUP BY candidate_id
  ) m);

  -- 最佳防守当选者：最高得票，并列均当选
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

  UPDATE public.activities SET settled = true WHERE id = p_activity_id;
END $function$;

-- 定时任务：每5分钟扫描比赛结束满12小时且未结算的活动自动结算
SELECT cron.schedule(
  'auto-settle-activities',
  '*/5 * * * *',
  $$
  SELECT public.settle_activity_activity(a.id)
  FROM public.activities a
  WHERE a.settled = false
    AND a.end_time IS NOT NULL
    AND now() >= a.end_time + interval '12 hours';
  $$
);