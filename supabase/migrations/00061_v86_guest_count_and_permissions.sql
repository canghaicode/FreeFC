-- v86：报名支持带人、外战修复、权限收紧

-- 1. 报名记录新增 guest_count（自己报名人数，不含本人）
ALTER TABLE public.registrations ADD COLUMN guest_count integer NOT NULL DEFAULT 0 CHECK (guest_count >= 0);

-- 2. 重写 join_with_seat：支持 guest_count；名额按 1 + guest_count 计算；候补保持原逻辑
DROP FUNCTION IF EXISTS public.join_with_seat(uuid, text);
CREATE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text, p_guest_count integer DEFAULT 0)
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
  v_next_seq integer;
  v_guests integer := GREATEST(p_guest_count, 0);
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
  SELECT COALESCE(sum(1 + guest_count), 0) INTO v_player_used
    FROM public.registrations
    WHERE activity_id = p_activity_id AND seat_role IN ('player','captain') AND status = 'confirmed';

  IF p_seat_role = 'coach' THEN
    IF v_coach_used >= v_act.coach_slots THEN
      RETURN jsonb_build_object('ok', false, 'message', '主教练席位已满');
    END IF;
    INSERT INTO public.registrations (activity_id, user_id, seat_role, status, guest_count)
    VALUES (p_activity_id, v_uid, 'coach', 'confirmed', 0);
    RETURN jsonb_build_object('ok', true, 'message', '主教练报名成功');
  END IF;

  IF p_seat_role = 'captain' AND v_captain_used >= v_act.captain_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '队长席位已满');
  END IF;

  -- 参与队员（含队长）名额满 -> 进入候补
  IF v_player_used + 1 + v_guests > v_act.max_players THEN
    SELECT COALESCE(MAX(waitlist_seq), 0) + 1 INTO v_next_seq
      FROM public.registrations WHERE activity_id = p_activity_id AND status = 'waitlist';
    INSERT INTO public.registrations (activity_id, user_id, seat_role, status, waitlist_seq, guest_count)
    VALUES (p_activity_id, v_uid, p_seat_role, 'waitlist', v_next_seq, v_guests);
    RETURN jsonb_build_object('ok', true, 'message', '名额已满，已加入候补（第' || v_next_seq || '位）', 'waitlist', true, 'waitlist_seq', v_next_seq);
  END IF;

  INSERT INTO public.registrations (activity_id, user_id, seat_role, status, guest_count)
  VALUES (p_activity_id, v_uid, p_seat_role, 'confirmed', v_guests);
  RETURN jsonb_build_object('ok', true, 'message', '报名成功');
END $function$;

-- 3. 更新 getActivities 计数逻辑：名额按 1+guest_count 占用（辅助前端，但不影响实际约束）
-- 保持原接口，由前端/后端 join_with_seat 原子约束。

-- 4. 权限收紧：活动表仅管理员可创建/修改/删除（移除发起人特权）
DROP POLICY IF EXISTS "Admins manage activities" ON public.activities;
CREATE POLICY "Admins manage activities" ON public.activities
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. match_summaries 权限同步收紧为仅管理员撰写（保持与活动管理一致）
DROP POLICY IF EXISTS "admin write summaries" ON public.match_summaries;
DROP POLICY IF EXISTS "admin update summaries" ON public.match_summaries;
CREATE POLICY "admin write summaries" ON public.match_summaries
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin update summaries" ON public.match_summaries
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
