DROP FUNCTION IF EXISTS public.auto_split_teams(uuid);
CREATE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_act public.activities%ROWTYPE;
  v_players uuid[];
  v_count integer;
  v_groups integer;
  v_team text;
  i integer;
BEGIN
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL OR v_act.match_type <> 'internal' THEN RETURN; END IF;
  v_groups := COALESCE(v_act.team_groups, 2);
  IF v_groups < 2 THEN v_groups := 2; END IF;
  IF v_groups > 4 THEN v_groups := 4; END IF;

  SELECT array_agg(user_id ORDER BY created_at) INTO v_players
  FROM public.registrations
  WHERE activity_id = p_activity_id AND seat_role IN ('player','captain') AND status = 'confirmed';
  v_count := COALESCE(array_length(v_players, 1), 0);
  IF v_count = 0 THEN RETURN; END IF;

  FOR i IN 1..v_count LOOP
    v_team := CASE (((i - 1) % v_groups))
      WHEN 0 THEN 'A'
      WHEN 1 THEN 'B'
      WHEN 2 THEN 'C'
      ELSE 'D'
    END;
    UPDATE public.registrations
    SET team = v_team
    WHERE activity_id = p_activity_id AND user_id = v_players[i];
  END LOOP;
END $function$;