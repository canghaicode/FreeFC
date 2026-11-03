-- v34 荣誉/数据额外奖励 + 每级属性点可配置
ALTER TABLE public.growth_config
  ADD COLUMN IF NOT EXISTS points_per_level integer NOT NULL DEFAULT 5 CHECK (points_per_level > 0),
  ADD COLUMN IF NOT EXISTS mvp_exp integer NOT NULL DEFAULT 50 CHECK (mvp_exp >= 0),
  ADD COLUMN IF NOT EXISTS mvp_activity integer NOT NULL DEFAULT 15 CHECK (mvp_activity >= 0),
  ADD COLUMN IF NOT EXISTS defender_exp integer NOT NULL DEFAULT 50 CHECK (defender_exp >= 0),
  ADD COLUMN IF NOT EXISTS defender_activity integer NOT NULL DEFAULT 15 CHECK (defender_activity >= 0),
  ADD COLUMN IF NOT EXISTS goal_exp integer NOT NULL DEFAULT 30 CHECK (goal_exp >= 0),
  ADD COLUMN IF NOT EXISTS goal_activity integer NOT NULL DEFAULT 5 CHECK (goal_activity >= 0),
  ADD COLUMN IF NOT EXISTS assist_exp integer NOT NULL DEFAULT 20 CHECK (assist_exp >= 0),
  ADD COLUMN IF NOT EXISTS assist_activity integer NOT NULL DEFAULT 5 CHECK (assist_activity >= 0);

-- 结算：基础出勤 + MVP/最佳防守/进球/助攻额外奖励，升级发点按配置
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
  v_mvp uuid;
  v_defender uuid;
  v_bonus_exp int;
  v_bonus_act int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  SELECT * INTO v_cfg FROM public.growth_config WHERE id = 1;

  -- 本场 MVP 与最佳防守当选者（得票最多，并列取先投者）
  SELECT candidate_id INTO v_mvp FROM public.match_votes
    WHERE activity_id = p_activity_id AND kind = 'mvp'
    GROUP BY candidate_id ORDER BY count(*) DESC, min(created_at) ASC LIMIT 1;
  SELECT candidate_id INTO v_defender FROM public.match_votes
    WHERE activity_id = p_activity_id AND kind = 'defender'
    GROUP BY candidate_id ORDER BY count(*) DESC, min(created_at) ASC LIMIT 1;

  FOR r IN
    SELECT p.id, p.exp,
      COALESCE(ms.goals, 0) AS goals,
      COALESCE(ms.assists, 0) AS assists
    FROM public.profiles p
    LEFT JOIN public.match_stats ms ON ms.user_id = p.id AND ms.activity_id = p_activity_id
    WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id)
  LOOP
    -- 额外奖励：MVP + 最佳防守 + 进球 + 助攻
    v_bonus_exp := 0;
    v_bonus_act := 0;
    IF r.id = v_mvp THEN
      v_bonus_exp := v_bonus_exp + v_cfg.mvp_exp;
      v_bonus_act := v_bonus_act + v_cfg.mvp_activity;
    END IF;
    IF r.id = v_defender THEN
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
  RETURN;
END $function$;