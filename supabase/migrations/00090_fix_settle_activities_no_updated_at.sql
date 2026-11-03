-- v116-3: activities 表无 updated_at 列，结算函数末尾 UPDATE 去掉 updated_at
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

  SELECT array_agg(user_id) INTO v_mvp FROM (
    SELECT ms.user_id, (COALESCE(ms.goals,0) + COALESCE(ms.assists,0)) AS total
    FROM public.match_stats ms
    WHERE ms.activity_id = p_activity_id
    ORDER BY total DESC, ms.created_at ASC
  ) sub
  WHERE total = (SELECT max(COALESCE(goals,0) + COALESCE(assists,0)) FROM public.match_stats WHERE activity_id = p_activity_id)
    AND total > 0;

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
  RETURN;
END $function$;