CREATE OR REPLACE FUNCTION public.alloc_points(p_key text, p_delta int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current int;
  v_cap int;
  v_free int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_key NOT IN ('ab_pace','ab_shooting','ab_passing','ab_dribbling','ab_defending','ab_stamina') THEN
    RAISE EXCEPTION '无效的能力维度';
  END IF;
  IF p_delta IS NULL OR p_delta <= 0 THEN RAISE EXCEPTION '加点需为正整数'; END IF;

  EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1 FOR UPDATE', p_key) INTO v_current USING v_user;
  SELECT public.ability_cap(v_user) INTO v_cap;
  SELECT free_points INTO v_free FROM public.profiles WHERE id = v_user;

  IF v_free < p_delta THEN RAISE EXCEPTION '可用属性点不足，完成出勤获取经验升级'; END IF;
  IF COALESCE(v_current, 50) + p_delta > v_cap THEN
    RAISE EXCEPTION '已达到当前能力上限（%），多出勤可解锁更高上限', v_cap;
  END IF;

  EXECUTE format('UPDATE public.profiles SET %I = COALESCE(%I, 50) + $2, free_points = free_points - $3, updated_at = now() WHERE id = $1', p_key, p_key)
  USING v_user, p_delta, p_delta;
  RETURN v_free - p_delta;
END $$;