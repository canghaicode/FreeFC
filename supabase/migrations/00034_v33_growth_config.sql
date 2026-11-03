-- 队长后台可配置的成长数值
CREATE TABLE public.growth_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  exp_per_level integer NOT NULL DEFAULT 100 CHECK (exp_per_level > 0),
  exp_per_match integer NOT NULL DEFAULT 100 CHECK (exp_per_match > 0),
  activity_per_match integer NOT NULL DEFAULT 100 CHECK (activity_per_match > 0),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.growth_config (id) VALUES (1);

ALTER TABLE public.growth_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_config_select_all" ON public.growth_config FOR SELECT USING (true);
CREATE POLICY "growth_config_update_admin" ON public.growth_config FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 结算改为读取后台配置的每场经验/活跃度与每级经验
DROP FUNCTION IF EXISTS public.settle_activity_activity(uuid);
CREATE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_old_exp int;
  v_new_exp int;
  v_old_lv int;
  v_new_lv int;
  v_exp_per_match int;
  v_act_per_match int;
  v_exp_per_level int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  SELECT exp_per_match, activity_per_match, exp_per_level
  INTO v_exp_per_match, v_act_per_match, v_exp_per_level
  FROM public.growth_config WHERE id = 1;

  FOR r IN
    SELECT p.id, p.exp
    FROM public.profiles p
    WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id)
  LOOP
    v_old_exp := r.exp;
    v_new_exp := r.exp + v_exp_per_match;
    v_old_lv := floor(v_old_exp / v_exp_per_level::numeric);
    v_new_lv := floor(v_new_exp / v_exp_per_level::numeric);
    UPDATE public.profiles
    SET activity = activity + v_act_per_match,
        exp = v_new_exp,
        free_points = free_points + GREATEST(v_new_lv - v_old_lv, 0) * 3,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
  RETURN;
END $function$;