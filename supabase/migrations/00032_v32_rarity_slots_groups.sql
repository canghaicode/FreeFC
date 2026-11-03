-- ============ 1. 技能/特性加星级（FIFA 金/银/铜 PlayStyles） ============
ALTER TABLE public.skill_catalog ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'gold' CHECK (rarity IN ('gold','silver','bronze'));

-- 按成本与强度重分配星级：高成本高加成的给金，中等的给银，基础的给铜
UPDATE public.skill_catalog SET rarity = 'gold' WHERE kind = 'skill' AND cost >= 350;
UPDATE public.skill_catalog SET rarity = 'silver' WHERE kind = 'skill' AND cost >= 250 AND cost < 350;
UPDATE public.skill_catalog SET rarity = 'bronze' WHERE kind = 'skill' AND cost < 250;
UPDATE public.skill_catalog SET rarity = 'gold' WHERE kind = 'trait' AND cost >= 350;
UPDATE public.skill_catalog SET rarity = 'silver' WHERE kind = 'trait' AND cost >= 250 AND cost < 350;
UPDATE public.skill_catalog SET rarity = 'bronze' WHERE kind = 'trait' AND cost < 250;

-- ============ 2. 活动加内战分组数（仅 internal 有效） ============
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS team_groups integer NOT NULL DEFAULT 2 CHECK (team_groups BETWEEN 2 AND 4);
UPDATE public.activities SET team_groups = 2 WHERE match_type = 'internal';
UPDATE public.activities SET team_groups = 1 WHERE match_type = 'external';

-- ============ 3. 允许主教练席位由发起人自选（移除强制触发器） ============
DROP TRIGGER IF EXISTS trg_force_coach_slots ON public.activities;
DROP FUNCTION IF EXISTS public.force_coach_slots();

-- ============ 4. 报名 RPC：支持队长/教练自选数量与多组内战 ============
CREATE OR REPLACE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_act public.activities%ROWTYPE;
  v_role text;
  v_coach_used integer;
  v_captain_used integer;
  v_player_used integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  IF p_seat_role NOT IN ('player','coach','captain') THEN
    RETURN jsonb_build_object('ok', false, 'message', '席位类型无效');
  END IF;
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', '活动不存在'); END IF;
  SELECT seat_role INTO v_role FROM public.registrations WHERE activity_id = p_activity_id AND user_id = v_uid;
  IF v_role IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '你已报名，请先取消');
  END IF;
  SELECT count(*) INTO v_coach_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role = 'coach';
  SELECT count(*) INTO v_captain_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role = 'captain';
  -- 参与队员（普通队员+队长）名额：教练不占名额
  SELECT count(*) INTO v_player_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role IN ('player','captain');
  IF p_seat_role IN ('player','captain') AND v_player_used >= v_act.max_players THEN
    RETURN jsonb_build_object('ok', false, 'message', '参与队员名额已满，可报名主教练席位');
  END IF;
  IF p_seat_role = 'coach' AND v_coach_used >= v_act.coach_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '主教练席位已满');
  END IF;
  IF p_seat_role = 'captain' AND v_captain_used >= v_act.captain_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '队长席位已满');
  END IF;
  INSERT INTO public.registrations (activity_id, user_id, seat_role)
  VALUES (p_activity_id, v_uid, p_seat_role);
  RETURN jsonb_build_object('ok', true, 'message', '报名成功');
END $function$;

-- ============ 5. 分队 RPC：按 team_groups 拆 N 组（仅内战） ============
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

  -- 只给 player/captain 分队，教练不参与
  SELECT array_agg(user_id ORDER BY created_at) INTO v_players
  FROM public.registrations
  WHERE activity_id = p_activity_id AND seat_role IN ('player','captain');
  v_count := COALESCE(array_length(v_players, 1), 0);
  IF v_count = 0 THEN RETURN; END IF;

  -- 蛇形分组：按报名时间先后蛇形填充到各组
  FOR i IN 1..v_count LOOP
    v_team := 'team' || (((i - 1) % v_groups) + 1)::text;
    UPDATE public.registrations
    SET team = v_team
    WHERE activity_id = p_activity_id AND user_id = v_players[i];
  END LOOP;
END $function$;