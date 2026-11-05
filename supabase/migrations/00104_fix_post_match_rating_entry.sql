-- 修复赛后评分入口：补开仍在评分窗口内的历史场次，并允许随队管理员评分。

UPDATE public.activities
SET post_match_rating_enabled = true
WHERE cancelled = false
  AND post_match_rating_enabled = false
  AND COALESCE(end_time, activity_time) <= now()
  AND now() <= COALESCE(end_time, activity_time) + interval '72 hours';

CREATE OR REPLACE FUNCTION public.get_post_match_rating_form(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_activity public.activities%ROWTYPE;
  v_end_at timestamptz;
  v_submitted boolean := false;
  v_participants jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', false, 'should_prompt', false, 'reason', '请先登录', 'participants', v_participants);
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', false, 'should_prompt', false, 'reason', '活动不存在', 'participants', v_participants);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.post_match_rating_submissions s
    WHERE s.activity_id = p_activity_id AND s.rater_id = v_uid
  ) INTO v_submitted;

  v_end_at := COALESCE(v_activity.end_time, v_activity.activity_time);

  IF NOT v_activity.post_match_rating_enabled OR v_activity.cancelled THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', v_submitted, 'should_prompt', false, 'reason', '本场不开放评分', 'participants', v_participants);
  END IF;

  IF v_end_at > now() THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', v_submitted, 'should_prompt', false, 'reason', '活动尚未结束', 'participants', v_participants);
  END IF;

  IF now() > v_end_at + interval '72 hours' THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', v_submitted, 'should_prompt', false, 'reason', '本场评分已截止', 'participants', v_participants);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.activity_id = p_activity_id
      AND r.user_id = v_uid
      AND r.status = 'confirmed'
      AND (
        r.seat_role IN ('player', 'captain')
        OR (r.seat_role = 'coach' AND p.role = 'admin'::public.user_role)
      )
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', v_submitted, 'should_prompt', false, 'reason', '仅本场参赛队员或随队管理员可评分', 'participants', v_participants);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.team_order, t.jersey_number NULLS LAST, t.nickname, t.id), '[]'::jsonb)
  INTO v_participants
  FROM (
    SELECT p.id,
      p.nickname,
      p.avatar_url,
      p.jersey_number,
      NULLIF(btrim(r.team), '') AS team,
      CASE NULLIF(btrim(r.team), '')
        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5
      END AS team_order
    FROM public.registrations r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.activity_id = p_activity_id
      AND r.status = 'confirmed'
      AND r.seat_role IN ('player', 'captain')
      AND r.user_id <> v_uid
  ) t;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(v_participants) > 0,
    'submitted', v_submitted,
    'should_prompt', NOT v_submitted AND jsonb_array_length(v_participants) > 0,
    'reason', CASE WHEN jsonb_array_length(v_participants) = 0 THEN '本场没有可评分队员' ELSE NULL END,
    'expires_at', v_end_at + interval '72 hours',
    'participants', v_participants
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_post_match_ratings(p_activity_id uuid, p_ratings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_activity public.activities%ROWTYPE;
  v_end_at timestamptz;
  v_is_admin boolean;
  v_item jsonb;
  v_rated_id uuid;
  v_score_text text;
  v_score smallint;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', '活动不存在');
  END IF;

  v_end_at := COALESCE(v_activity.end_time, v_activity.activity_time);
  IF NOT v_activity.post_match_rating_enabled OR v_activity.cancelled THEN
    RETURN jsonb_build_object('ok', false, 'message', '本场不开放评分');
  END IF;
  IF v_end_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'message', '活动尚未结束');
  END IF;
  IF now() > v_end_at + interval '72 hours' THEN
    RETURN jsonb_build_object('ok', false, 'message', '本场评分已截止');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.post_match_rating_submissions s
    WHERE s.activity_id = p_activity_id AND s.rater_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', '本场评分已提交');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.activity_id = p_activity_id
      AND r.user_id = v_uid
      AND r.status = 'confirmed'
      AND (
        r.seat_role IN ('player', 'captain')
        OR (r.seat_role = 'coach' AND p.role = 'admin'::public.user_role)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', '仅本场参赛队员或随队管理员可评分');
  END IF;
  IF p_ratings IS NULL OR jsonb_typeof(p_ratings) <> 'array' OR jsonb_array_length(p_ratings) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', '请至少评价一名队员');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings)
  LOOP
    BEGIN
      v_rated_id := (v_item->>'rated_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'message', '评分对象无效');
    END;
    v_score_text := v_item->>'score';
    IF v_score_text IS NULL OR v_score_text !~ '^(10|[1-9])$' THEN
      RETURN jsonb_build_object('ok', false, 'message', '分数必须为1到10的整数');
    END IF;
    v_score := v_score_text::smallint;
    IF v_rated_id = v_uid THEN
      RETURN jsonb_build_object('ok', false, 'message', '不能给自己评分');
    END IF;
    IF v_rated_id = ANY(v_seen) THEN
      RETURN jsonb_build_object('ok', false, 'message', '存在重复评分对象');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.activity_id = p_activity_id
        AND r.user_id = v_rated_id
        AND r.status = 'confirmed'
        AND r.seat_role IN ('player', 'captain')
    ) THEN
      RETURN jsonb_build_object('ok', false, 'message', '评分对象不属于本场参赛队员');
    END IF;
    v_seen := array_append(v_seen, v_rated_id);
  END LOOP;

  SELECT p.role = 'admin'::public.user_role INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = v_uid;
  v_is_admin := COALESCE(v_is_admin, false);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings)
  LOOP
    INSERT INTO public.post_match_ratings (activity_id, rater_id, rated_id, score, rater_is_admin)
    VALUES (p_activity_id, v_uid, (v_item->>'rated_id')::uuid, (v_item->>'score')::smallint, v_is_admin);
  END LOOP;

  INSERT INTO public.post_match_rating_submissions (activity_id, rater_id, rater_is_admin)
  VALUES (p_activity_id, v_uid, v_is_admin);

  RETURN jsonb_build_object('ok', true, 'message', '匿名评分已提交', 'submitted_count', jsonb_array_length(p_ratings));
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_post_match_rating_form(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_post_match_ratings(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
