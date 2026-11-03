-- 修复：升级发点基于经验等级（每100EXP升1级，每级+3点），而非活跃度档位
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS TABLE (leveled_up boolean, new_level int) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD;
  v_old_exp int;
  v_new_exp int;
  v_old_lv int;
  v_new_lv int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  FOR r IN
    SELECT p.id, p.exp
    FROM public.profiles p
    WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id)
  LOOP
    v_old_exp := r.exp;
    v_new_exp := r.exp + 100;
    -- 0-based 等级索引：floor(exp/100)，出勤1场恰好升1级
    v_old_lv := floor(v_old_exp / 100.0);
    v_new_lv := floor(v_new_exp / 100.0);
    UPDATE public.profiles
    SET activity = activity + 100,
        exp = v_new_exp,
        free_points = free_points + GREATEST(v_new_lv - v_old_lv, 0) * 3,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
  RETURN;
END $$;