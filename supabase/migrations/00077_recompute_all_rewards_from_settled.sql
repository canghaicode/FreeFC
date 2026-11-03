DO $$
DECLARE
  v_cfg public.growth_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.growth_config WHERE id = 1;

  UPDATE public.profiles SET exp = 0, activity = 0, free_points = 0;

  INSERT INTO public.profiles (id, exp, activity, free_points)
  SELECT
    agg.user_id,
    v_cfg.exp_per_match * agg.appearances + agg.goals*v_cfg.goal_exp + agg.assists*v_cfg.assist_exp,
    v_cfg.activity_per_match * agg.appearances + agg.goals*v_cfg.goal_activity + agg.assists*v_cfg.assist_activity,
    0
  FROM (
    SELECT r.user_id,
      count(*) AS appearances,
      COALESCE(sum(ms.goals),0) AS goals,
      COALESCE(sum(ms.assists),0) AS assists
    FROM registrations r
    JOIN activities a ON a.id = r.activity_id AND a.settled = true AND a.cancelled = false AND a.match_type IN ('match','internal')
    LEFT JOIN match_stats ms ON ms.activity_id = r.activity_id AND ms.user_id = r.user_id
    WHERE r.status = 'confirmed'
    GROUP BY r.user_id
  ) agg
  ON CONFLICT (id) DO UPDATE SET
    exp = EXCLUDED.exp,
    activity = EXCLUDED.activity;

  UPDATE public.profiles
  SET free_points = floor(exp / v_cfg.exp_per_level::numeric)::int * v_cfg.points_per_level;
END $$;