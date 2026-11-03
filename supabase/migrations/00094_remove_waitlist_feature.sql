-- 取消候补机制：满员时直接拒绝报名，不再生成候补记录
CREATE OR REPLACE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text, p_guest_count integer DEFAULT 0, p_guests jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_act public.activities%ROWTYPE;
  v_role text;
  v_coach_used integer;
  v_captain_used integer;
  v_player_used integer;
  v_guests integer := GREATEST(p_guest_count, 0);
  v_new_reg_id uuid;
  v_guest jsonb;
  v_i integer;
  v_max_guests integer;
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
    VALUES (p_activity_id, v_uid, 'coach', 'confirmed', 0)
    RETURNING id INTO v_new_reg_id;
    RETURN jsonb_build_object('ok', true, 'message', '主教练报名成功');
  END IF;

  IF p_seat_role = 'captain' AND v_captain_used >= v_act.captain_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '队长席位已满');
  END IF;

  -- 满员直接拒绝，不再加入候补
  IF v_player_used + 1 + v_guests > v_act.max_players THEN
    RETURN jsonb_build_object('ok', false, 'message', '名额已满，无法报名');
  END IF;

  INSERT INTO public.registrations (activity_id, user_id, seat_role, status, guest_count)
  VALUES (p_activity_id, v_uid, p_seat_role, 'confirmed', v_guests)
  RETURNING id INTO v_new_reg_id;

  v_max_guests := LEAST(jsonb_array_length(p_guests), v_guests);
  IF v_max_guests > 0 THEN
    FOR v_i IN 0..v_max_guests - 1 LOOP
      v_guest := p_guests->v_i;
      INSERT INTO public.registration_guests (registration_id, activity_id, seq, name, position)
      VALUES (v_new_reg_id, p_activity_id, v_i + 1,
        NULLIF(trim(v_guest->>'name'), ''),
        NULLIF(trim(v_guest->>'position'), ''));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', '报名成功');
END $function$;