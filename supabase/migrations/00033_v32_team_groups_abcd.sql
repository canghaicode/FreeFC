-- 分队值扩展到 A/B/C/D，匹配 team_groups 2-4
CREATE OR REPLACE FUNCTION public.set_registration_team(p_reg_id uuid, p_team text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_team IS NOT NULL AND p_team NOT IN ('A','B','C','D') THEN RAISE EXCEPTION '无效分队'; END IF;
  SELECT a.created_by INTO v_creator FROM registrations r JOIN activities a ON a.id = r.activity_id WHERE r.id = p_reg_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '报名记录不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE registrations SET team = p_team WHERE id = p_reg_id;
END $$;

-- 自动分队：按 team_groups 生成 A/B/C/D
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_players uuid[];
  v_count integer;
  v_groups integer;
  v_team text;
  i integer;
BEGIN
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN RETURN; END IF;
  v_groups := COALESCE(v_act.team_groups, 2);
  IF v_groups < 2 THEN v_groups := 2; END IF;
  IF v_groups > 4 THEN v_groups := 4; END IF;

  SELECT array_agg(user_id ORDER BY created_at) INTO v_players
  FROM public.registrations
  WHERE activity_id = p_activity_id AND seat_role IN ('player','captain');
  v_count := COALESCE(array_length(v_players, 1), 0);
  IF v_count = 0 THEN RETURN; END IF;

  -- 蛇形分组保证平衡：先按报名时间排序，再蛇形填充 A/B/C/D
  FOR i IN 1..v_count LOOP
    v_team := CASE (((i - 1) % v_groups))
      WHEN 0 THEN 'A'
      WHEN 1 THEN 'B'
      WHEN 2 THEN 'C'
      ELSE 'D'
    END;
    UPDATE public.registrations
    SET team = v_team
    WHERE activity_id = p_activity_id AND user_id = v_players[i];
  END LOOP;
END $function$;