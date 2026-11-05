-- 赛后评分候选人补充球衣号码与本场生效位置，供评分行展示。

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
      COALESCE(r.assigned_position, p.preferred_position) AS position,
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

GRANT EXECUTE ON FUNCTION public.get_post_match_rating_form(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
