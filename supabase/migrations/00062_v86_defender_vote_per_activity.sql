-- v86：最佳防守投票改为赛后单场计票（与 MVP 同表逻辑），旧 defender_votes 表废弃保留

-- 1. match_votes 已支持 kind='defender'，无需改表
-- 2. 修正 cast_match_vote：确保单场单类型单票（已存在 UNIQUE，下面是幂等覆盖）
DROP FUNCTION IF EXISTS public.cast_match_vote(uuid, uuid, text);
CREATE FUNCTION public.cast_match_vote(p_activity_id uuid, p_candidate_id uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_voter uuid := auth.uid();
  v_activity public.activities%ROWTYPE;
  v_end timestamptz;
BEGIN
  IF v_voter IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_kind NOT IN ('mvp','defender') THEN
    RETURN jsonb_build_object('ok', false, 'message', '投票类型无效');
  END IF;
  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id;
  IF v_activity.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '活动不存在');
  END IF;
  v_end := COALESCE(v_activity.end_time, v_activity.activity_time);
  -- 仅活动结束后 12 小时内可投
  IF v_activity.cancelled THEN
    RETURN jsonb_build_object('ok', false, 'message', '活动已取消');
  END IF;
  IF v_end > now() THEN
    RETURN jsonb_build_object('ok', false, 'message', '比赛结束后才可投票');
  END IF;
  IF v_end + interval '12 hours' <= now() THEN
    RETURN jsonb_build_object('ok', false, 'message', '投票已截止');
  END IF;
  -- 候选人必须在本活动已确认报名且不能投自己
  IF NOT EXISTS (
    SELECT 1 FROM public.registrations
    WHERE activity_id = p_activity_id AND user_id = p_candidate_id AND status = 'confirmed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', '候选人未报名本场活动');
  END IF;
  IF p_candidate_id = v_voter THEN
    RETURN jsonb_build_object('ok', false, 'message', '不能投给自己');
  END IF;
  -- 投票人自己也必须报名本场
  IF NOT EXISTS (
    SELECT 1 FROM public.registrations
    WHERE activity_id = p_activity_id AND user_id = v_voter AND status = 'confirmed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', '仅报名队员可投票');
  END IF;

  INSERT INTO public.match_votes (activity_id, voter_id, candidate_id, kind)
  VALUES (p_activity_id, v_voter, p_candidate_id, p_kind)
  ON CONFLICT (activity_id, voter_id, kind)
  DO UPDATE SET candidate_id = EXCLUDED.candidate_id, created_at = now();

  RETURN jsonb_build_object('ok', true);
END $function$;
