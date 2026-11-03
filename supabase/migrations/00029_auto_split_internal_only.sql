CREATE OR REPLACE FUNCTION public.auto_split_teams(p_activity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_type text; v_rows uuid[]; v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT match_type, created_by INTO v_type, v_creator FROM activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION '活动不存在'; END IF;
  IF v_type <> 'internal' THEN RAISE EXCEPTION '仅内战活动支持自动分队'; END IF;
  IF v_creator <> v_uid AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  SELECT array_agg(id ORDER BY created_at) INTO v_rows FROM registrations WHERE activity_id = p_activity_id;
  IF v_rows IS NULL OR array_length(v_rows, 1) IS NULL THEN RETURN; END IF;
  FOR i IN 1..array_length(v_rows, 1) LOOP
    UPDATE registrations SET team = CASE WHEN (i % 2) = 1 THEN 'A' ELSE 'B' END WHERE id = v_rows[i];
  END LOOP;
END $$;