-- 重写加点：支持减点回收自由属性点，基础值统一 60
CREATE OR REPLACE FUNCTION public.alloc_points(p_key text, p_delta integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current int;
  v_cap int;
  v_free int;
  v_next int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_key NOT IN ('ab_pace','ab_shooting','ab_passing','ab_dribbling','ab_defending','ab_stamina') THEN
    RAISE EXCEPTION '无效的能力维度';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION '加点数值不能为0'; END IF;

  EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1 FOR UPDATE', p_key) INTO v_current USING v_user;
  SELECT public.ability_cap(v_user) INTO v_cap;
  SELECT free_points INTO v_free FROM public.profiles WHERE id = v_user;

  v_current := COALESCE(v_current, 60);
  v_next := v_current + p_delta;

  IF p_delta > 0 THEN
    -- 加点：消耗自由属性点，不超过当前上限
    IF v_free < p_delta THEN RAISE EXCEPTION '可用属性点不足，可调减其他属性或出勤升级获取'; END IF;
    IF v_next > v_cap THEN RAISE EXCEPTION '已达到当前能力上限（%），多出勤可解锁更高上限', v_cap; END IF;
    EXECUTE format('UPDATE public.profiles SET %I = $2, free_points = free_points - $3, updated_at = now() WHERE id = $1', p_key)
    USING v_user, v_next, p_delta;
    RETURN v_free - p_delta;
  ELSE
    -- 减点：不低于基础值 60，回收自由属性点
    IF v_next < 60 THEN RAISE EXCEPTION '单项属性不能低于基础值60'; END IF;
    EXECUTE format('UPDATE public.profiles SET %I = $2, free_points = free_points + $3, updated_at = now() WHERE id = $1', p_key)
    USING v_user, v_next, abs(p_delta);
    RETURN v_free + abs(p_delta);
  END IF;
END $$;