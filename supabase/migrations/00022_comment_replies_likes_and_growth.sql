-- ============ 评论盖楼（回复）+ 点赞 ============
ALTER TABLE public.activity_comments
  ADD COLUMN parent_id uuid REFERENCES public.activity_comments(id) ON DELETE CASCADE,
  ADD COLUMN reply_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.activity_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read likes" ON public.comment_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "like own" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "unlike own" ON public.comment_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ 经验值 + 自由加点 ============
ALTER TABLE public.profiles
  ADD COLUMN exp integer NOT NULL DEFAULT 0,
  ADD COLUMN free_points integer NOT NULL DEFAULT 0;

-- ============ 技能加成列 ============
ALTER TABLE public.skill_catalog
  ADD COLUMN bonus_key text,
  ADD COLUMN bonus_value integer NOT NULL DEFAULT 0;

ALTER TABLE public.skill_catalog DROP CONSTRAINT IF EXISTS skill_bonus_key_check;
ALTER TABLE public.skill_catalog ADD CONSTRAINT skill_bonus_key_check CHECK (
  bonus_key IS NULL OR bonus_key IN ('ab_pace','ab_shooting','ab_passing','ab_dribbling','ab_defending','ab_stamina')
);

-- ============ 技能加成种子 ============
INSERT INTO public.skill_catalog (name, kind, description, cost, sort_order, bonus_key, bonus_value) VALUES
  ('铁肺', 'trait', '体能储备惊人，90分钟后依然满场飞奔', 200, 1, 'ab_stamina', 2),
  ('猎豹步伐', 'trait', '起步爆发力出色，边路冲刺如猎豹', 200, 2, 'ab_pace', 2),
  ('精准制导', 'trait', '传中落点如同装了GPS，指哪打哪', 150, 3, 'ab_passing', 2),
  ('铁闸', 'trait', '一夫当关，万夫莫开的防守威慑', 150, 4, 'ab_defending', 2),
  ('领袖气质', 'trait', '场上指挥若定，凝聚全队士气', 250, 5, NULL, 0),
  ('手术刀直塞', 'skill', '穿透防线的致命直塞球', 300, 11, 'ab_passing', 3),
  ('重炮手', 'skill', '禁区外暴力抽射，门将噩梦', 300, 12, 'ab_shooting', 3),
  ('精准拦截', 'skill', '预判传球线路，一击即断', 300, 13, 'ab_defending', 3),
  ('马赛回旋', 'skill', '华丽摆脱过人的招牌动作', 300, 14, 'ab_dribbling', 3),
  ('贴地斩', 'skill', '贴地任意球直窜死角', 350, 15, 'ab_shooting', 3)
ON CONFLICT DO NOTHING;

-- ============ 能力上限函数 ============
CREATE OR REPLACE FUNCTION public.ability_cap(uid uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT least(75 + floor(COALESCE((SELECT count(*) FROM public.registrations r WHERE r.user_id = uid), 0) / 5), 99)::int
$$;

-- ============ 出勤结算（活跃度+100、经验+100、升级发点）============
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS TABLE (leveled_up boolean, new_level int) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD;
  v_level int;
  v_new_level int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  FOR r IN
    SELECT p.id, p.activity
    FROM public.profiles p
    WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id)
  LOOP
    v_level := CASE WHEN r.activity >= 3000 THEN 5 WHEN r.activity >= 1500 THEN 4 WHEN r.activity >= 700 THEN 3 WHEN r.activity >= 300 THEN 2 ELSE 1 END;
    UPDATE public.profiles
    SET activity = activity + 100, exp = exp + 100, updated_at = now()
    WHERE id = r.id
    RETURNING activity INTO r.activity;
    v_new_level := CASE WHEN r.activity >= 3000 THEN 5 WHEN r.activity >= 1500 THEN 4 WHEN r.activity >= 700 THEN 3 WHEN r.activity >= 300 THEN 2 ELSE 1 END;
    IF v_new_level > v_level THEN
      UPDATE public.profiles SET free_points = free_points + (v_new_level - v_level) * 3 WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN;
END $$;

-- ============ 自由加点 RPC ============
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

  SELECT ab INTO v_current FROM public.profiles WHERE id = v_user FOR UPDATE;
  SELECT public.ability_cap(v_user) INTO v_cap;
  SELECT free_points INTO v_free FROM public.profiles WHERE id = v_user;

  IF v_free < p_delta THEN RAISE EXCEPTION '可用属性点不足，完成出勤获取经验升级'; END IF;
  IF COALESCE(v_current, 50) + p_delta > v_cap THEN
    RAISE EXCEPTION '已达到当前能力上限（%），多出勤可解锁更高上限', v_cap;
  END IF;

  UPDATE public.profiles
  SET ab = COALESCE(ab, 50) + p_delta, free_points = free_points - p_delta, updated_at = now()
  WHERE id = v_user;
  RETURN v_free - p_delta;
END $$;