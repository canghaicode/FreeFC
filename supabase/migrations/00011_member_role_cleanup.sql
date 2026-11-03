CREATE OR REPLACE FUNCTION public.set_member_role(target_uid uuid, new_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_role text;
  admin_count int;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '仅管理员可设置角色';
  END IF;

  IF new_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION '无效的角色类型';
  END IF;

  IF target_uid = auth.uid() THEN
    RAISE EXCEPTION '不能修改自己的角色';
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = target_uid;
  IF target_role IS NULL THEN
    RAISE EXCEPTION '队员不存在';
  END IF;

  IF target_role = new_role THEN
    RAISE EXCEPTION '该队员已是%角色', CASE WHEN new_role = 'admin' THEN '管理员' ELSE '普通队员' END;
  END IF;

  IF target_role = 'admin' AND new_role = 'user' THEN
    SELECT COUNT(*) INTO admin_count FROM profiles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION '队伍至少需要保留一名管理员';
    END IF;
  END IF;

  UPDATE profiles SET role = new_role, updated_at = now() WHERE id = target_uid;

  RETURN CASE WHEN new_role = 'admin' THEN '已提升为管理员' ELSE '已降级为普通队员' END;
END $function$;