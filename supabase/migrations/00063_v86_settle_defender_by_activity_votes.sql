-- v86：结算时最佳防守按 match_votes(kind='defender') 单场得票最高者，与 MVP 逻辑一致；并更新 member_growth 中 def_votes 为“获奖次数”

-- 1. 重写结算 RPC（基于最新 v48 版本），MVP 按造球、最佳防守按单场 match_votes 票数
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
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

-- 2. 更新 member_growth 中 def_votes 的含义：从旧 defender_votes 累计点数改为“赛季/历史最佳防守获奖次数”
--    与 firepower 联动：每次获奖 +25
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
    COALESCE(dv.def_wins, 0) AS def_votes
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
    -- 最佳防守获奖次数：以 activity 为单位，同场多人并列则各算一次
    SELECT candidate_id, count(*)::integer AS def_wins
    FROM (
      SELECT activity_id, candidate_id, count(*) AS cnt
      FROM match_votes WHERE kind = 'defender'
      GROUP BY activity_id, candidate_id
    ) per_act
    WHERE cnt = (
      SELECT max(cnt2) FROM (
        SELECT count(*) AS cnt2 FROM match_votes WHERE kind = 'defender' AND activity_id = per_act.activity_id GROUP BY candidate_id
      ) m
    )
    GROUP BY candidate_id
  ) dv ON dv.candidate_id = p.id
)
SELECT id, nickname, avatar_url, jersey_number, preferred_position, role, activity, level,
  appearances, goals, assists, def_votes,
  (activity::numeric * 0.3) + (appearances * 40)::numeric + (level * 80)::numeric
    + (goals * 30)::numeric + (assists * 20)::numeric + (def_votes * 25)::numeric AS firepower
FROM base;
