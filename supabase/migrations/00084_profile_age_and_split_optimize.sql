-- 1. 球员资料加年龄
ALTER TABLE public.profiles ADD COLUMN age integer;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_age_range CHECK (age IS NULL OR (age >= 10 AND age <= 99));

-- 2. 自动分队增强：蛇形分配后追加两两交换优化，最小化各队总分极差
CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_groups integer;
  v_score numeric;
  v_totals numeric[];
  v_totals2 numeric[];
  v_idx integer;
  v_i integer;
  v_j integer;
  v_total integer;
  v_pass integer;
  v_swapped boolean;
  v_max numeric; v_min numeric; v_max2 numeric; v_min2 numeric;
  v_i_team integer; v_j_team integer;
  v_i_score numeric; v_j_score numeric;
BEGIN
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN RETURN; END IF;
  v_groups := GREATEST(2, LEAST(4, COALESCE(v_act.team_groups, 2)));

  CREATE TEMP TABLE _split_players (seq integer, kind text, uid uuid, guest_id uuid, score numeric, team_idx integer) ON COMMIT DROP;
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

  -- 蛇形初始分配
  v_totals := ARRAY(SELECT 0::numeric FROM generate_series(1, v_groups));
  FOR v_i IN 1..v_total LOOP
    SELECT score INTO v_score FROM _split_players WHERE seq = v_i;
    v_idx := CASE WHEN ((v_i - 1) / v_groups) % 2 = 0
      THEN ((v_i - 1) % v_groups) + 1
      ELSE v_groups - ((v_i - 1) % v_groups) END;
    UPDATE _split_players SET team_idx = v_idx WHERE seq = v_i;
    v_totals[v_idx] := v_totals[v_idx] + v_score;
  END LOOP;

  -- 两两交换优化：交换后各队总分极差严格缩小才执行，多轮迭代至收敛
  FOR v_pass IN 1..10 LOOP
    v_swapped := false;
    FOR v_i IN 1..v_total - 1 LOOP
      FOR v_j IN v_i + 1..v_total LOOP
        SELECT team_idx, score INTO v_i_team, v_i_score FROM _split_players WHERE seq = v_i;
        SELECT team_idx, score INTO v_j_team, v_j_score FROM _split_players WHERE seq = v_j;
        CONTINUE WHEN v_i_team IS NULL OR v_j_team IS NULL OR v_i_team = v_j_team;
        v_totals2 := v_totals;
        v_totals2[v_i_team] := v_totals[v_i_team] - v_i_score + v_j_score;
        v_totals2[v_j_team] := v_totals[v_j_team] - v_j_score + v_i_score;
        SELECT max(t), min(t) INTO v_max, v_min FROM unnest(v_totals) AS t;
        SELECT max(t), min(t) INTO v_max2, v_min2 FROM unnest(v_totals2) AS t;
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

  -- 写回分队结果
  UPDATE public.registrations r
  SET team = CASE s.team_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END
  FROM _split_players s
  WHERE s.kind = 'user' AND s.uid = r.user_id AND r.activity_id = p_activity_id;
  UPDATE public.registration_guests g
  SET team = CASE s.team_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END
  FROM _split_players s
  WHERE s.kind = 'guest' AND s.guest_id = g.id;
END $function$;