-- 自动分队只处理尚未分队的正式队员和嘉宾。
-- 已有 team 的记录作为固定成员参与平衡计算，但不会被改写或交换。
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_groups integer;
  v_totals numeric[];
  v_totals2 numeric[];
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
  SELECT * INTO v_act
  FROM public.activities
  WHERE id = p_activity_id;

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

  -- 正式队员：已分队记录固定；空 team 记录等待分配。
  INSERT INTO _split_players (seq, kind, reg_id, uid, guest_id, score, team_idx, fixed)
  SELECT
    row_number() OVER (ORDER BY COALESCE(ar.avg_rating, 6.0) DESC, r.created_at)::integer,
    'user',
    r.id,
    r.user_id,
    NULL::uuid,
    COALESCE(ar.avg_rating, 6.0),
    CASE btrim(r.team)
      WHEN 'A' THEN 1
      WHEN 'B' THEN 2
      WHEN 'C' THEN 3
      WHEN 'D' THEN 4
      ELSE NULL
    END,
    (r.team IS NOT NULL AND btrim(r.team) <> '')
  FROM public.registrations r
  LEFT JOIN public.player_avg_ratings ar ON ar.user_id = r.user_id
  WHERE r.activity_id = p_activity_id
    AND r.seat_role IN ('player', 'captain')
    AND r.status = 'confirmed';

  -- 嘉宾默认评分 6.0，处理方式与正式队员相同。
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
      WHEN 'A' THEN 1
      WHEN 'B' THEN 2
      WHEN 'C' THEN 3
      WHEN 'D' THEN 4
      ELSE NULL
    END,
    (g.team IS NOT NULL AND btrim(g.team) <> '')
  FROM public.registration_guests g
  JOIN public.registrations r ON r.id = g.registration_id
  WHERE g.activity_id = p_activity_id
    AND r.status = 'confirmed'
    AND r.seat_role IN ('player', 'captain');

  SELECT count(*) INTO v_total FROM _split_players;
  IF v_total = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_unassigned
  FROM _split_players
  WHERE NOT fixed;
  IF v_unassigned = 0 THEN
    RETURN;
  END IF;

  -- 先把已经存在的分队计入各队总分，作为不可移动的基础。
  v_totals := ARRAY(SELECT 0::numeric FROM generate_series(1, v_groups));
  FOR v_i IN 1..v_total LOOP
    SELECT team_idx, fixed, score
    INTO v_idx, v_i_fixed, v_score
    FROM _split_players
    WHERE seq = v_i;

    IF v_i_fixed AND v_idx BETWEEN 1 AND v_groups THEN
      v_totals[v_idx] := v_totals[v_idx] + v_score;
    END IF;
  END LOOP;

  -- 按评分从高到低，把未分队成员放入当前总分最低的队伍。
  -- 已分队成员不会进入此循环。
  FOR v_seq, v_score IN
    SELECT seq, score
    FROM _split_players
    WHERE NOT fixed
    ORDER BY score DESC, seq
  LOOP
    v_idx := 1;
    FOR v_j IN 2..v_groups LOOP
      IF v_totals[v_j] < v_totals[v_idx] THEN
        v_idx := v_j;
      END IF;
    END LOOP;

    UPDATE _split_players
    SET team_idx = v_idx
    WHERE seq = v_seq;
    v_totals[v_idx] := v_totals[v_idx] + v_score;
  END LOOP;

  -- 只允许未分队成员之间交换，进一步缩小队伍总分差；固定成员永不参与交换。
  FOR v_pass IN 1..10 LOOP
    v_swapped := false;

    FOR v_i IN 1..v_total - 1 LOOP
      FOR v_j IN v_i + 1..v_total LOOP
        SELECT team_idx, score, fixed
        INTO v_i_team, v_i_score, v_i_fixed
        FROM _split_players
        WHERE seq = v_i;
        CONTINUE WHEN v_i_fixed;

        SELECT team_idx, score, fixed
        INTO v_j_team, v_j_score, v_j_fixed
        FROM _split_players
        WHERE seq = v_j;
        CONTINUE WHEN v_j_fixed OR v_i_team IS NULL OR v_j_team IS NULL OR v_i_team = v_j_team;

        v_totals2 := v_totals;
        v_totals2[v_i_team] := v_totals[v_i_team] - v_i_score + v_j_score;
        v_totals2[v_j_team] := v_totals[v_j_team] - v_j_score + v_i_score;

        SELECT max(value), min(value)
        INTO v_max, v_min
        FROM unnest(v_totals) AS totals(value);
        SELECT max(value), min(value)
        INTO v_max2, v_min2
        FROM unnest(v_totals2) AS totals(value);

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

  -- 只写回原本没有分队的记录，并再次检查当前数据库值为空，避免覆盖并发中的手动分队。
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
END $function$;
