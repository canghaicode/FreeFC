-- 队长后台：重置队员资料
CREATE OR REPLACE FUNCTION public.captain_reset_member_profile(p_target_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_role user_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '仅队长/管理员可执行该操作';
  END IF;
  SELECT role INTO v_role FROM profiles WHERE id = p_target_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION '队员不存在'; END IF;
  IF p_target_uid = '3dca509b-4ab0-4b83-ad48-f7865eb8c319'::uuid THEN
    RAISE EXCEPTION '永久队长资料不可重置';
  END IF;
  IF v_role = 'admin' THEN RAISE EXCEPTION '不可重置管理员/队长资料'; END IF;
  UPDATE profiles SET
    nickname = '未命名队员',
    jersey_number = null,
    preferred_position = null,
    secondary_position = null,
    updated_at = now()
  WHERE id = p_target_uid;
END $$;

-- 队长后台：直接调整队员六维能力值与自由属性点
CREATE OR REPLACE FUNCTION public.captain_set_member_abilities(p_target_uid uuid, p_values jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_role user_role; k text; v int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '仅队长/管理员可执行该操作';
  END IF;
  SELECT role INTO v_role FROM profiles WHERE id = p_target_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION '队员不存在'; END IF;
  IF p_target_uid = '3dca509b-4ab0-4b83-ad48-f7865eb8c319'::uuid THEN
    RAISE EXCEPTION '永久队长能力值不可调整';
  END IF;
  IF v_role = 'admin' THEN RAISE EXCEPTION '不可调整管理员/队长能力值'; END IF;

  FOREACH k IN ARRAY ARRAY['ab_pace','ab_shooting','ab_passing','ab_dribbling','ab_defending','ab_stamina'] LOOP
    IF p_values ? k THEN
      v := (p_values->>k)::int;
      IF v < 40 OR v > 99 THEN RAISE EXCEPTION '能力值须在40-99之间'; END IF;
    END IF;
  END LOOP;
  IF p_values ? 'free_points' THEN
    v := (p_values->>'free_points')::int;
    IF v < 0 THEN RAISE EXCEPTION '自由属性点不能为负数'; END IF;
  END IF;

  UPDATE profiles SET
    ab_pace = CASE WHEN p_values ? 'ab_pace' THEN (p_values->>'ab_pace')::int ELSE ab_pace END,
    ab_shooting = CASE WHEN p_values ? 'ab_shooting' THEN (p_values->>'ab_shooting')::int ELSE ab_shooting END,
    ab_passing = CASE WHEN p_values ? 'ab_passing' THEN (p_values->>'ab_passing')::int ELSE ab_passing END,
    ab_dribbling = CASE WHEN p_values ? 'ab_dribbling' THEN (p_values->>'ab_dribbling')::int ELSE ab_dribbling END,
    ab_defending = CASE WHEN p_values ? 'ab_defending' THEN (p_values->>'ab_defending')::int ELSE ab_defending END,
    ab_stamina = CASE WHEN p_values ? 'ab_stamina' THEN (p_values->>'ab_stamina')::int ELSE ab_stamina END,
    free_points = CASE WHEN p_values ? 'free_points' THEN (p_values->>'free_points')::int ELSE free_points END,
    updated_at = now()
  WHERE id = p_target_uid;
END $$;