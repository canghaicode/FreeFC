CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_groups integer;
  v_uid uuid;
  v_score numeric;
  v_team text;
  v_totals numeric[];
  v_min_idx integer;
  v_min_val numeric;
  v_i integer;
  v_total integer;
BEGIN
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN RETURN; END IF;
  v_groups := GREATEST(2, LEAST(4, COALESCE(v_act.team_groups, 2)));

  -- 临时表：已报名队员 + 评分（无评分默认 6.0），按评分降序
  CREATE TEMP TABLE _split_players (seq integer, uid uuid, score numeric) ON COMMIT DROP;
  INSERT INTO _split_players (seq, uid, score)
  SELECT row_number() OVER (ORDER BY COALESCE(ar.avg_rating, 6.0) DESC, r.created_at),
         r.user_id, COALESCE(ar.avg_rating, 6.0)
  FROM public.registrations r
  LEFT JOIN public.player_avg_ratings ar ON ar.user_id = r.user_id
  WHERE r.activity_id = p_activity_id AND r.seat_role IN ('player','captain') AND r.status = 'confirmed';

  SELECT count(*) INTO v_total FROM _split_players;
  IF v_total = 0 THEN RETURN; END IF;

  v_totals := ARRAY(SELECT 0::numeric FROM generate_series(1, v_groups));

  -- 蛇形分配：奇数轮正序、偶数轮反序，使相邻高分分散到不同组
  FOR v_i IN 1..v_total LOOP
    SELECT uid, score INTO v_uid, v_score FROM _split_players WHERE seq = v_i;
    IF (((v_i - 1) / v_groups) % 2) = 0 THEN
      v_min_idx := ((v_i - 1) % v_groups) + 1;
    ELSE
      v_min_idx := v_groups - ((v_i - 1) % v_groups);
    END IF;
    v_team := CASE v_min_idx WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'D' END;
    v_totals[v_min_idx] := v_totals[v_min_idx] + v_score;
    UPDATE public.registrations SET team = v_team WHERE activity_id = p_activity_id AND user_id = v_uid;
  END LOOP;
END $function$;