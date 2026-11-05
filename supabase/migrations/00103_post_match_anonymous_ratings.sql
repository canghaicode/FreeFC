-- 赛后匿名表现分：按活动提交，管理员组 70% / 队员组 30%，仅管理员可看汇总。
-- 已结束的历史活动默认关闭；迁移时尚未结束及后续新建活动开启评分。

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS post_match_rating_enabled boolean;

UPDATE public.activities
SET post_match_rating_enabled = (
  cancelled = false
  AND COALESCE(end_time, activity_time) > now()
)
WHERE post_match_rating_enabled IS NULL;

ALTER TABLE public.activities
  ALTER COLUMN post_match_rating_enabled SET DEFAULT true,
  ALTER COLUMN post_match_rating_enabled SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.post_match_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
  rater_is_admin boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_match_ratings_not_self CHECK (rater_id <> rated_id),
  CONSTRAINT post_match_ratings_once UNIQUE (activity_id, rater_id, rated_id)
);

CREATE INDEX IF NOT EXISTS idx_post_match_ratings_rated_activity
  ON public.post_match_ratings (rated_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_post_match_ratings_activity
  ON public.post_match_ratings (activity_id);

CREATE TABLE IF NOT EXISTS public.post_match_rating_submissions (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rater_is_admin boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, rater_id)
);

ALTER TABLE public.post_match_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_match_rating_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_match_ratings FROM anon, authenticated;
REVOKE ALL ON public.post_match_rating_submissions FROM anon, authenticated;

-- 当前账号可用的赛后评分表单。评分人身份与已提交明细均不下发。
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
    WHERE r.activity_id = p_activity_id
      AND r.user_id = v_uid
      AND r.status = 'confirmed'
      AND r.seat_role IN ('player', 'captain')
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'submitted', v_submitted, 'should_prompt', false, 'reason', '仅本场参赛队员可评分', 'participants', v_participants);
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

-- 一次性提交本场非空评分；空白队员不写入，不产生 0 分。
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

  -- 同一活动的提交串行化，保证“提交一次”与评分明细原子一致。
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
    SELECT 1 FROM public.registrations r
    WHERE r.activity_id = p_activity_id
      AND r.user_id = v_uid
      AND r.status = 'confirmed'
      AND r.seat_role IN ('player', 'captain')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', '仅本场参赛队员可评分');
  END IF;
  IF p_ratings IS NULL OR jsonb_typeof(p_ratings) <> 'array' OR jsonb_array_length(p_ratings) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', '请至少评价一名队员');
  END IF;

  -- 先完整校验，再写入；异常或失败不会留下部分评分。
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

-- 每名球员每场先按组聚合；两组都有时管理员70%、队员30%，缺一组时使用现有组均分。
CREATE OR REPLACE VIEW public.post_match_rating_activity_scores AS
SELECT r.rated_id,
  r.activity_id,
  COALESCE(a.end_time, a.activity_time) AS ended_at,
  CASE
    WHEN count(*) FILTER (WHERE r.rater_is_admin) > 0
      AND count(*) FILTER (WHERE NOT r.rater_is_admin) > 0
      THEN (avg(r.score) FILTER (WHERE r.rater_is_admin)) * 0.7
        + (avg(r.score) FILTER (WHERE NOT r.rater_is_admin)) * 0.3
    WHEN count(*) FILTER (WHERE r.rater_is_admin) > 0
      THEN avg(r.score) FILTER (WHERE r.rater_is_admin)
    ELSE avg(r.score) FILTER (WHERE NOT r.rater_is_admin)
  END::numeric AS match_score,
  count(*) FILTER (WHERE r.rater_is_admin)::integer AS admin_rating_count,
  count(*) FILTER (WHERE NOT r.rater_is_admin)::integer AS player_rating_count
FROM public.post_match_ratings r
JOIN public.activities a ON a.id = r.activity_id
WHERE a.cancelled = false
GROUP BY r.rated_id, r.activity_id, COALESCE(a.end_time, a.activity_time);

-- 从最近有评分的比赛向前取10场；隐藏分是场次等权平均。
-- 分队估计分按样本可信度向6.0回归：管理员参与的场次证据权重1，纯队员场次权重0.3，证据达到3后使用原始隐藏分。
CREATE OR REPLACE VIEW public.hidden_player_rating_summary AS
WITH ranked AS (
  SELECT s.*,
    row_number() OVER (PARTITION BY s.rated_id ORDER BY s.ended_at DESC, s.activity_id DESC) AS rn
  FROM public.post_match_rating_activity_scores s
), recent AS (
  SELECT * FROM ranked WHERE rn <= 10
), aggregated AS (
  SELECT rated_id AS user_id,
    avg(match_score)::numeric AS hidden_rating_raw,
    count(*)::integer AS match_count,
    count(*) FILTER (WHERE admin_rating_count > 0)::integer AS admin_match_count,
    sum(admin_rating_count)::integer AS admin_rating_count,
    sum(player_rating_count)::integer AS player_rating_count,
    min(ended_at) AS first_match_at,
    max(ended_at) AS last_match_at
  FROM recent
  GROUP BY rated_id
)
SELECT user_id,
  round(hidden_rating_raw, 1) AS hidden_rating,
  match_count,
  admin_match_count,
  admin_rating_count,
  player_rating_count,
  (admin_rating_count + player_rating_count)::integer AS rating_count,
  first_match_at,
  last_match_at,
  round(
    6.0 + (hidden_rating_raw - 6.0)
      * LEAST(1.0, (admin_match_count + (match_count - admin_match_count) * 0.3) / 3.0),
    3
  ) AS split_rating
FROM aggregated;

REVOKE ALL ON public.post_match_rating_activity_scores FROM anon, authenticated;
REVOKE ALL ON public.hidden_player_rating_summary FROM anon, authenticated;

-- 仅管理员读取隐藏分汇总，不返回任何评分人或单场明细。
CREATE OR REPLACE FUNCTION public.get_hidden_rating_members()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '仅管理员可查看隐藏分' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.hidden_rating DESC NULLS LAST, t.rating_count DESC, t.jersey_number NULLS LAST, t.id)
    FROM (
      SELECT p.id,
        p.nickname,
        p.avatar_url,
        p.jersey_number,
        p.preferred_position,
        h.hidden_rating,
        COALESCE(h.match_count, 0)::integer AS match_count,
        COALESCE(h.admin_rating_count, 0)::integer AS admin_rating_count,
        COALESCE(h.player_rating_count, 0)::integer AS player_rating_count,
        COALESCE(h.rating_count, 0)::integer AS rating_count,
        h.first_match_at,
        h.last_match_at
      FROM public.profiles p
      LEFT JOIN public.hidden_player_rating_summary h ON h.user_id = p.id
    ) t
  ), '[]'::jsonb);
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_post_match_rating_form(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_post_match_ratings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hidden_rating_members() TO authenticated;

-- 自动分队保留原入口：只处理未分队成员，优先平衡人数，再在人数不变的前提下缩小总实力差。
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_groups integer;
  v_totals numeric[];
  v_totals2 numeric[];
  v_counts integer[];
  v_total integer;
  v_unassigned integer;
  v_i integer;
  v_j integer;
  v_seq integer;
  v_score numeric;
  v_idx integer;
  v_i_team integer;
  v_j_team integer;
  v_i_score numeric;
  v_j_score numeric;
  v_i_fixed boolean;
  v_j_fixed boolean;
  v_pass integer;
  v_swapped boolean;
  v_max numeric;
  v_min numeric;
  v_max2 numeric;
  v_min2 numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '仅管理员可自动分队' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_act
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN
    RETURN;
  END IF;

  v_groups := GREATEST(2, LEAST(4, COALESCE(v_act.team_groups, 2)));

  CREATE TEMP TABLE _split_players (
    seq integer PRIMARY KEY,
    kind text NOT NULL,
    reg_id uuid,
    uid uuid,
    guest_id uuid,
    score numeric NOT NULL,
    team_idx integer,
    fixed boolean NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _split_players (seq, kind, reg_id, uid, guest_id, score, team_idx, fixed)
  SELECT
    row_number() OVER (ORDER BY COALESCE(h.split_rating, 6.0) DESC, r.created_at)::integer,
    'user',
    r.id,
    r.user_id,
    NULL::uuid,
    COALESCE(h.split_rating, 6.0),
    CASE btrim(r.team)
      WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE NULL
    END,
    (r.team IS NOT NULL AND btrim(r.team) <> '')
  FROM public.registrations r
  LEFT JOIN public.hidden_player_rating_summary h ON h.user_id = r.user_id
  WHERE r.activity_id = p_activity_id
    AND r.seat_role IN ('player', 'captain')
    AND r.status = 'confirmed';

  INSERT INTO _split_players (seq, kind, reg_id, uid, guest_id, score, team_idx, fixed)
  SELECT
    (row_number() OVER (ORDER BY g.created_at)
      + (SELECT COALESCE(max(seq), 0) FROM _split_players))::integer,
    'guest',
    g.registration_id,
    NULL::uuid,
    g.id,
    6.0,
    CASE btrim(g.team)
      WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE NULL
    END,
    (g.team IS NOT NULL AND btrim(g.team) <> '')
  FROM public.registration_guests g
  JOIN public.registrations r ON r.id = g.registration_id
  WHERE g.activity_id = p_activity_id
    AND r.status = 'confirmed'
    AND r.seat_role IN ('player', 'captain');

  SELECT count(*) INTO v_total FROM _split_players;
  IF v_total = 0 THEN RETURN; END IF;

  SELECT count(*) INTO v_unassigned FROM _split_players WHERE NOT fixed;
  IF v_unassigned = 0 THEN RETURN; END IF;

  v_totals := ARRAY(SELECT 0::numeric FROM generate_series(1, v_groups));
  v_counts := ARRAY(SELECT 0::integer FROM generate_series(1, v_groups));

  FOR v_i IN 1..v_total LOOP
    SELECT team_idx, fixed, score INTO v_idx, v_i_fixed, v_score
    FROM _split_players WHERE seq = v_i;
    IF v_i_fixed AND v_idx BETWEEN 1 AND v_groups THEN
      v_totals[v_idx] := v_totals[v_idx] + v_score;
      v_counts[v_idx] := v_counts[v_idx] + 1;
    END IF;
  END LOOP;

  -- 人数最少的队优先；人数相同时放入当前总实力最低的队。
  FOR v_seq, v_score IN
    SELECT seq, score FROM _split_players WHERE NOT fixed ORDER BY score DESC, seq
  LOOP
    v_idx := 1;
    FOR v_j IN 2..v_groups LOOP
      IF v_counts[v_j] < v_counts[v_idx]
        OR (v_counts[v_j] = v_counts[v_idx] AND v_totals[v_j] < v_totals[v_idx]) THEN
        v_idx := v_j;
      END IF;
    END LOOP;

    UPDATE _split_players SET team_idx = v_idx WHERE seq = v_seq;
    v_totals[v_idx] := v_totals[v_idx] + v_score;
    v_counts[v_idx] := v_counts[v_idx] + 1;
  END LOOP;

  -- 交换不会改变人数；只在严格缩小队伍总实力极差时接受。
  FOR v_pass IN 1..10 LOOP
    v_swapped := false;
    FOR v_i IN 1..v_total - 1 LOOP
      FOR v_j IN v_i + 1..v_total LOOP
        SELECT team_idx, score, fixed INTO v_i_team, v_i_score, v_i_fixed
        FROM _split_players WHERE seq = v_i;
        CONTINUE WHEN v_i_fixed;

        SELECT team_idx, score, fixed INTO v_j_team, v_j_score, v_j_fixed
        FROM _split_players WHERE seq = v_j;
        CONTINUE WHEN v_j_fixed OR v_i_team IS NULL OR v_j_team IS NULL OR v_i_team = v_j_team;

        v_totals2 := v_totals;
        v_totals2[v_i_team] := v_totals[v_i_team] - v_i_score + v_j_score;
        v_totals2[v_j_team] := v_totals[v_j_team] - v_j_score + v_i_score;

        SELECT max(value), min(value) INTO v_max, v_min FROM unnest(v_totals) AS totals(value);
        SELECT max(value), min(value) INTO v_max2, v_min2 FROM unnest(v_totals2) AS totals(value);

        IF (v_max2 - v_min2) < (v_max - v_min) - 0.001 THEN
          UPDATE _split_players SET team_idx = v_j_team WHERE seq = v_i;
          UPDATE _split_players SET team_idx = v_i_team WHERE seq = v_j;
          v_totals := v_totals2;
          v_swapped := true;
        END IF;
      END LOOP;
    END LOOP;
    EXIT WHEN NOT v_swapped;
  END LOOP;

  UPDATE public.registrations r
  SET team = CASE s.team_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END
  FROM _split_players s
  WHERE s.kind = 'user'
    AND s.reg_id = r.id
    AND NOT s.fixed
    AND r.activity_id = p_activity_id
    AND (r.team IS NULL OR btrim(r.team) = '');

  UPDATE public.registration_guests g
  SET team = CASE s.team_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END
  FROM _split_players s
  WHERE s.kind = 'guest'
    AND s.guest_id = g.id
    AND NOT s.fixed
    AND (g.team IS NULL OR btrim(g.team) = '');
END
$function$;

GRANT EXECUTE ON FUNCTION public.auto_split_teams(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
