-- v115: 手动指定队员场上位置（权限同换队：活动创建者或管理员）
CREATE OR REPLACE FUNCTION public.set_registration_position(p_reg_id uuid, p_position text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_position IS NOT NULL AND p_position NOT IN ('前锋','中场','后卫','门将') THEN RAISE EXCEPTION '无效位置'; END IF;
  SELECT a.created_by INTO v_creator FROM registrations r JOIN activities a ON a.id = r.activity_id WHERE r.id = p_reg_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION '报名记录不存在'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE registrations SET assigned_position = p_position WHERE id = p_reg_id;
END $function$;