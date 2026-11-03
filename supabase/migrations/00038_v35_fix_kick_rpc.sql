DROP FUNCTION IF EXISTS public.get_kick_requests(text);
CREATE FUNCTION public.get_kick_requests(p_status text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_target int;
  v_result jsonb;
BEGIN
  SELECT squat_target INTO v_target FROM public.growth_config WHERE id = 1;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      kr.id, kr.creator_id, kr.preferred_time, kr.preferred_location, kr.note, kr.status, kr.created_at,
      p.nickname AS creator_nickname, p.avatar_url AS creator_avatar,
      COALESCE(pc.cnt, 0) AS participant_count,
      v_target AS target,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', pp.user_id, 'nickname', pp2.nickname, 'avatar_url', pp2.avatar_url))
        FROM public.kick_request_participants pp
        JOIN public.profiles pp2 ON pp2.id = pp.user_id
        WHERE pp.request_id = kr.id
      ), '[]'::jsonb) AS participants
    FROM public.kick_requests kr
    LEFT JOIN public.profiles p ON p.id = kr.creator_id
    LEFT JOIN (SELECT request_id, count(*) AS cnt FROM public.kick_request_participants GROUP BY request_id) pc ON pc.request_id = kr.id
    WHERE kr.status = p_status
  ) t;
  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;