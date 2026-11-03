-- join_with_seat：接收嘉宾列表（姓名+位置），插入 registration_guests
CREATE OR REPLACE FUNCTION public.join_with_seat(
  p_activity_id uuid,
  p_seat_role text,
  p_guest_count integer DEFAULT 0,
  p_guests jsonb DEFAULT '[]'::jsonb
)
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

  IF v_player_used + 1 + v_guests > v_act.max_players THEN
    SELECT COALESCE(MAX(waitlist_seq), 0) + 1 INTO v_next_seq
      FROM public.registrations WHERE activity_id = p_activity_id AND status = 'waitlist';
    INSERT INTO public.registrations (activity_id, user_id, seat_role, status, waitlist_seq, guest_count)
    VALUES (p_activity_id, v_uid, p_seat_role, 'waitlist', v_next_seq, v_guests)
    RETURNING id INTO v_new_reg_id;
    RETURN jsonb_build_object('ok', true, 'message', '名额已满，已加入候补（第' || v_next_seq || '位）', 'waitlist', true, 'waitlist_seq', v_next_seq);
  END IF;

  INSERT INTO public.registrations (activity_id, user_id, seat_role, status, guest_count)
  VALUES (p_activity_id, v_uid, p_seat_role, 'confirmed', v_guests)
  RETURNING id INTO v_new_reg_id;

  -- 插入嘉宾明细（姓名+位置）；超出 guest_count 的传入项忽略
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

-- 嘉宾换队（管理员/发起人）
CREATE OR REPLACE FUNCTION public.set_guest_team(p_guest_id uuid, p_team text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_team IS NOT NULL AND p_team NOT IN ('A','B','C','D') THEN RAISE EXCEPTION '无效分队'; END IF;
  SELECT a.created_by INTO v_creator FROM registration_guests g JOIN activities a ON a.id = g.activity_id WHERE g.id = p_guest_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '嘉宾不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE registration_guests SET team = p_team WHERE id = p_guest_id;
END $function$;

-- auto_split_teams：正式队员 + 嘉宾一起蛇形均衡分组
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_groups integer;
  v_kind text;
  v_uid uuid;
  v_guest_id uuid;
  v_score numeric;
  v_team text;
  v_totals numeric[];
  v_idx integer;
  v_i integer;
  v_total integer;
BEGIN
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN RETURN; END IF;
  v_groups := GREATEST(2, LEAST(4, COALESCE(v_act.team_groups, 2)));

  CREATE TEMP TABLE _split_players (seq integer, kind text, uid uuid, guest_id uuid, score numeric) ON COMMIT DROP;
  INSERT INTO _split_players (seq, kind, uid, guest_id, score)
  SELECT row_number() OVER (ORDER BY COALESCE(ar.avg_rating, 6.0) DESC, r.created_at),
         'user', r.user_id, NULL::uuid, COALESCE(ar.avg_rating, 6.0)
  FROM public.registrations r
  LEFT JOIN public.player_avg_ratings ar ON ar.user_id = r.user_id
  WHERE r.activity_id = p_activity_id AND r.seat_role IN ('player','captain') AND r.status = 'confirmed';
  INSERT INTO _split_players (seq, kind, uid, guest_id, score)
  SELECT row_number() OVER (ORDER BY g.created_at) + (SELECT COALESCE(max(seq), 0) FROM _split_players),
         'guest', NULL::uuid, g.id, 6.0
  FROM public.registration_guests g
  JOIN public.registrations r ON r.id = g.registration_id
  WHERE g.activity_id = p_activity_id AND r.status = 'confirmed' AND r.seat_role IN ('player','captain');

  SELECT count(*) INTO v_total FROM _split_players;
  IF v_total = 0 THEN RETURN; END IF;

  v_totals := ARRAY(SELECT 0::numeric FROM generate_series(1, v_groups));

  FOR v_i IN 1..v_total LOOP
    SELECT kind, uid, guest_id, score INTO v_kind, v_uid, v_guest_id, v_score FROM _split_players WHERE seq = v_i;
    v_idx := CASE WHEN ((v_i - 1) / v_groups) % 2 = 0
      THEN ((v_i - 1) % v_groups) + 1
      ELSE v_groups - ((v_i - 1) % v_groups) END;
    v_team := CASE v_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END;
    v_totals[v_idx] := v_totals[v_idx] + v_score;
    IF v_kind = 'user' THEN
      UPDATE public.registrations SET team = v_team WHERE activity_id = p_activity_id AND user_id = v_uid;
    ELSE
      UPDATE public.registration_guests SET team = v_team WHERE id = v_guest_id;
    END IF;
  END LOOP;
END $function$;