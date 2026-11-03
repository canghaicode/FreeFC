-- 1) 比赛类型（内战/外战）与报名分队
ALTER TABLE public.activities ADD COLUMN match_type text NOT NULL DEFAULT 'internal';
ALTER TABLE public.registrations ADD COLUMN team text;

-- 2) 重建 member_growth 视图：火力值融合活跃度/出勤/等级/进球/助攻/防守得票
DROP VIEW public.member_growth;
CREATE VIEW public.member_growth AS
SELECT p.id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position, p.role, p.activity,
  CASE WHEN p.activity >= 3000 THEN 5 WHEN p.activity >= 1500 THEN 4 WHEN p.activity >= 700 THEN 3 WHEN p.activity >= 300 THEN 2 ELSE 1 END AS level,
  COALESCE(ss.appearances, 0) AS appearances,
  COALESCE(ms.goals, 0) AS goals,
  COALESCE(ms.assists, 0) AS assists,
  COALESCE(dv.def_votes, 0) AS def_votes,
  (
    p.activity::numeric * 0.3
    + (COALESCE(ss.appearances, 0) * 40)::numeric
    + (CASE WHEN p.activity >= 3000 THEN 5 WHEN p.activity >= 1500 THEN 4 WHEN p.activity >= 700 THEN 3 WHEN p.activity >= 300 THEN 2 ELSE 1 END * 80)::numeric
    + (COALESCE(ms.goals, 0) * 30)::numeric
    + (COALESCE(ms.assists, 0) * 20)::numeric
    + (COALESCE(dv.def_votes, 0) * 25)::numeric
  ) AS firepower
FROM profiles p
LEFT JOIN (SELECT user_id, count(*)::int AS appearances FROM registrations GROUP BY user_id) ss ON ss.user_id = p.id
LEFT JOIN (SELECT user_id, sum(goals)::int AS goals, sum(assists)::int AS assists FROM match_stats GROUP BY user_id) ms ON ms.user_id = p.id
LEFT JOIN (SELECT candidate_id, sum(points)::int AS def_votes FROM defender_votes GROUP BY candidate_id) dv ON dv.candidate_id = p.id;

-- 3) 重置所有球员六维为 60，发放 20 自由属性点
UPDATE public.profiles
SET ab_pace = 60, ab_shooting = 60, ab_passing = 60, ab_dribbling = 60, ab_defending = 60, ab_stamina = 60,
    free_points = 20, updated_at = now();

-- 4) 主教练调整分队
CREATE OR REPLACE FUNCTION public.set_registration_team(p_reg_id uuid, p_team text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_team IS NOT NULL AND p_team NOT IN ('A','B') THEN RAISE EXCEPTION '无效分队'; END IF;
  SELECT a.created_by INTO v_creator FROM registrations r JOIN activities a ON a.id = r.activity_id WHERE r.id = p_reg_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '报名记录不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE registrations SET team = p_team WHERE id = p_reg_id;
END $$;

-- 5) 主教练安排队长/席位
CREATE OR REPLACE FUNCTION public.set_registration_seat(p_reg_id uuid, p_seat text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_seat NOT IN ('player','coach','captain') THEN RAISE EXCEPTION '无效席位'; END IF;
  SELECT a.created_by INTO v_creator FROM registrations r JOIN activities a ON a.id = r.activity_id WHERE r.id = p_reg_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '报名记录不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE registrations SET seat_role = p_seat WHERE id = p_reg_id;
END $$;

-- 6) 外战自动平均分队
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_type text; v_rows uuid[]; v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT match_type, created_by INTO v_type, v_creator FROM activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION '活动不存在'; END IF;
  IF v_type <> 'external' THEN RAISE EXCEPTION '仅外战活动支持自动分队'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  SELECT array_agg(id ORDER BY created_at) INTO v_rows FROM registrations WHERE activity_id = p_activity_id;
  IF v_rows IS NULL OR array_length(v_rows, 1) IS NULL THEN RETURN; END IF;
  FOR i IN 1..array_length(v_rows, 1) LOOP
    UPDATE registrations SET team = CASE WHEN (i % 2) = 1 THEN 'A' ELSE 'B' END WHERE id = v_rows[i];
  END LOOP;
END $$;