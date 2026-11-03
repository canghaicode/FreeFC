-- 装备系统货币统一为「活跃度」：废弃独立活力值字段，与既有活跃度规则（出勤/活动结算累计）一致

-- 1) 废弃独立的活力值列
ALTER TABLE public.profiles DROP COLUMN vitality;

-- 2) 删除旧版活力值兑换函数
DROP FUNCTION public.exchange_vitality_to_points(integer);

-- 3) 装备购买改为消耗活跃度 activity
CREATE OR REPLACE FUNCTION public.purchase_equipment(p_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_activity integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  SELECT cost INTO v_cost FROM public.equipment_catalog WHERE id = p_equipment_id;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '装备不存在');
  END IF;
  SELECT activity INTO v_activity FROM public.profiles WHERE id = v_uid;
  IF v_activity < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'message', '活跃度不足');
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_equipment WHERE user_id = v_uid AND equipment_id = p_equipment_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', '已拥有该装备');
  END IF;
  UPDATE public.profiles SET activity = activity - v_cost, updated_at = now() WHERE id = v_uid;
  INSERT INTO public.member_equipment (user_id, equipment_id, equipped) VALUES (v_uid, p_equipment_id, false);
  RETURN jsonb_build_object('ok', true, 'message', '兑换成功');
END $function$;

-- 4) 活跃度兑换属性点
CREATE OR REPLACE FUNCTION public.exchange_activity_to_points(p_points integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 200;
  v_total integer;
  v_activity integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  IF p_points IS NULL OR p_points <= 0 OR p_points > 10 THEN
    RETURN jsonb_build_object('ok', false, 'message', '兑换数量需在1-10之间');
  END IF;
  v_total := v_cost * p_points;
  SELECT activity INTO v_activity FROM public.profiles WHERE id = v_uid;
  IF v_activity < v_total THEN
    RETURN jsonb_build_object('ok', false, 'message', '活跃度不足');
  END IF;
  UPDATE public.profiles
    SET activity = activity - v_total, free_points = free_points + p_points, updated_at = now()
    WHERE id = v_uid;
  RETURN jsonb_build_object('ok', true, 'message', '兑换成功', 'points', p_points);
END $function$;