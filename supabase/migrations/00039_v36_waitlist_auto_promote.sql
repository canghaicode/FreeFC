-- 候补字段：status 区分正选/候补，waitlist_seq 为候补序号
ALTER TABLE public.registrations
  ADD COLUMN status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','waitlist')),
  ADD COLUMN waitlist_seq integer NOT NULL DEFAULT 0;

-- 重写 join_with_seat：参与队员名额满时自动进入候补队列
DROP FUNCTION IF EXISTS public.join_with_seat(uuid, text);
CREATE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text)
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
  SELECT count(*) INTO v_player_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role IN ('player','captain') AND status = 'confirmed';

  IF p_seat_role = 'coach' THEN
    IF v_coach_used >= v_act.coach_slots THEN
      RETURN jsonb_build_object('ok', false, 'message', '主教练席位已满');
    END IF;
    INSERT INTO public.registrations (activity_id, user_id, seat_role, status)
    VALUES (p_activity_id, v_uid, 'coach', 'confirmed');
    RETURN jsonb_build_object('ok', true, 'message', '主教练报名成功');
  END IF;

  IF p_seat_role = 'captain' AND v_captain_used >= v_act.captain_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '队长席位已满');
  END IF;

  -- 参与队员（普通队员+队长）名额满 -> 进入候补
  IF v_player_used >= v_act.max_players THEN
    SELECT COALESCE(MAX(waitlist_seq), 0) + 1 INTO v_next_seq
    FROM public.registrations WHERE activity_id = p_activity_id AND status = 'waitlist';
    INSERT INTO public.registrations (activity_id, user_id, seat_role, status, waitlist_seq)
    VALUES (p_activity_id, v_uid, p_seat_role, 'waitlist', v_next_seq);
    RETURN jsonb_build_object('ok', true, 'message', '名额已满，已加入候补（第' || v_next_seq || '位）', 'waitlist', true, 'waitlist_seq', v_next_seq);
  END IF;

  INSERT INTO public.registrations (activity_id, user_id, seat_role, status)
  VALUES (p_activity_id, v_uid, p_seat_role, 'confirmed');
  RETURN jsonb_build_object('ok', true, 'message', '报名成功');
END $function$;

-- 取消报名：正选取消时自动把最早候补提升为正选（FIFO）
DROP FUNCTION IF EXISTS public.cancel_registration(uuid, uuid);
CREATE FUNCTION public.cancel_registration(p_activity_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_promoted uuid;
BEGIN
  -- 仅本人或管理员可取消
  IF v_uid IS NULL OR (v_uid <> p_user_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin')) THEN
    RETURN jsonb_build_object('ok', false, 'message', '无权操作');
  END IF;

  DELETE FROM public.registrations WHERE activity_id = p_activity_id AND user_id = p_user_id;

  -- 若被取消的是正选，且有候补，提升最早候补
  SELECT user_id INTO v_promoted
  FROM public.registrations
  WHERE activity_id = p_activity_id AND status = 'waitlist'
  ORDER BY waitlist_seq ASC
  LIMIT 1;

  IF v_promoted IS NOT NULL THEN
    UPDATE public.registrations
    SET status = 'confirmed', waitlist_seq = 0
    WHERE activity_id = p_activity_id AND user_id = v_promoted;
    -- 后续候补序号前移
    UPDATE public.registrations
    SET waitlist_seq = waitlist_seq - 1
    WHERE activity_id = p_activity_id AND status = 'waitlist' AND waitlist_seq > 1;
    RETURN jsonb_build_object('ok', true, 'promoted', v_promoted);
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;