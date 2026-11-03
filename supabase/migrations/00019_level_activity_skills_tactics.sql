-- ============ profiles 扩展字段 ============
ALTER TABLE public.profiles
  ADD COLUMN activity integer NOT NULL DEFAULT 0 CHECK (activity >= 0),
  ADD COLUMN home_team text;

-- ============ 等级/活跃度/火力值 视图 ============
CREATE OR REPLACE VIEW public.member_growth AS
SELECT
  p.id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position, p.role,
  p.activity,
  CASE
    WHEN p.activity >= 3000 THEN 5
    WHEN p.activity >= 1500 THEN 4
    WHEN p.activity >= 700 THEN 3
    WHEN p.activity >= 300 THEN 2
    ELSE 1
  END AS level,
  COALESCE(ss.appearances, 0) AS appearances,
  (
    (p.activity * 0.4)
    + (COALESCE(ss.appearances, 0) * 50)
    + (CASE WHEN p.activity >= 3000 THEN 5 WHEN p.activity >= 1500 THEN 4 WHEN p.activity >= 700 THEN 3 WHEN p.activity >= 300 THEN 2 ELSE 1 END) * 100
  ) AS firepower
FROM public.profiles p
LEFT JOIN (
  SELECT user_id, count(*)::integer AS appearances
  FROM public.registrations
  GROUP BY user_id
) ss ON ss.user_id = p.id;

-- ============ FIFA 特性/技能库（种子数据） ============
CREATE TABLE public.skill_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('trait','skill')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  cost integer NOT NULL DEFAULT 100 CHECK (cost >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read catalog" ON public.skill_catalog FOR SELECT USING (true);

INSERT INTO public.skill_catalog (kind, name, description, cost, sort_order) VALUES
  ('trait','领袖气质','场上指挥若定，激励队友士气', 200, 1),
  ('trait','铁人','体能充沛，全场飞奔不知疲倦', 200, 2),
  ('trait','精准传中','边路传中落点精准，威胁十足', 150, 3),
  ('trait','大力界外球','掷界外球力大无穷，直逼禁区', 100, 4),
  ('trait','终结者','门前嗅觉敏锐，把握机会能力出众', 250, 5),
  ('skill','马赛回旋','华丽摆脱过人的招牌动作', 300, 11),
  ('skill','踩单车','连续假动作晃晕防守球员', 300, 12),
  ('skill','精准贴地斩','贴地任意球直窜死角', 350, 13),
  ('skill','倒挂金钩','凌空倒钩射门，极具观赏性', 400, 14),
  ('skill','人球分过','利用速度优势人球分离突破', 250, 15);

-- ============ 队员已解锁/已装备的技能 ============
CREATE TABLE public.member_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skill_catalog(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);
CREATE INDEX idx_member_skills_user ON public.member_skills(user_id);
ALTER TABLE public.member_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read member_skills" ON public.member_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "users manage own skills" ON public.member_skills
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own skills" ON public.member_skills
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users delete own skills" ON public.member_skills
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ 战术板：活动席位配置 ============
ALTER TABLE public.activities
  ADD COLUMN coach_slots integer NOT NULL DEFAULT 0 CHECK (coach_slots BETWEEN 0 AND 2),
  ADD COLUMN captain_slots integer NOT NULL DEFAULT 0 CHECK (captain_slots BETWEEN 0 AND 2);

-- ============ 战术板：报名席位角色 ============
ALTER TABLE public.registrations
  ADD COLUMN seat_role text NOT NULL DEFAULT 'player' CHECK (seat_role IN ('player','coach','captain'));

-- ============ 战术板：一对一战术指导 ============
CREATE TABLE public.tactics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team text NOT NULL DEFAULT 'A' CHECK (team IN ('A','B','red','blue')),
  view_mode text NOT NULL DEFAULT 'half' CHECK (view_mode IN ('half','full')),
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tactics_activity ON public.tactics(activity_id, target_user_id);
ALTER TABLE public.tactics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read tactics" ON public.tactics FOR SELECT TO authenticated USING (true);
CREATE POLICY "coach/captain create tactics" ON public.tactics
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "author update tactics" ON public.tactics
  FOR UPDATE TO authenticated USING (author_id = auth.uid());
CREATE POLICY "target confirm tactics" ON public.tactics
  FOR UPDATE TO authenticated USING (target_user_id = auth.uid() AND confirmed = false);
CREATE POLICY "author delete tactics" ON public.tactics
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ============ RPC: 出勤结算活跃度（管理员触发，每出勤+100）============
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  UPDATE public.profiles p SET activity = activity + 100, updated_at = now()
  WHERE p.id IN (SELECT user_id FROM public.registrations WHERE activity_id = p_activity_id);
END $function$;

-- ============ RPC: 解锁技能（扣活跃度）============
CREATE OR REPLACE FUNCTION public.unlock_skill(p_skill_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_activity integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  SELECT cost INTO v_cost FROM public.skill_catalog WHERE id = p_skill_id;
  IF v_cost IS NULL THEN RAISE EXCEPTION '技能不存在'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_skills WHERE user_id = v_uid AND skill_id = p_skill_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', '该技能已解锁');
  END IF;
  SELECT activity INTO v_activity FROM public.profiles WHERE id = v_uid;
  IF v_activity < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'message', '活跃度不足，完成出勤即可获取活跃度');
  END IF;
  UPDATE public.profiles SET activity = activity - v_cost, updated_at = now() WHERE id = v_uid;
  INSERT INTO public.member_skills (user_id, skill_id) VALUES (v_uid, p_skill_id);
  RETURN jsonb_build_object('ok', true, 'message', '解锁成功');
END $function$;

-- ============ RPC: 装备/卸下技能（上限：特性2+技能2）============
CREATE OR REPLACE FUNCTION public.toggle_skill_equipped(p_skill_id uuid, p_equipped boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  SELECT sc.kind INTO v_kind
  FROM public.member_skills ms JOIN public.skill_catalog sc ON sc.id = ms.skill_id
  WHERE ms.user_id = v_uid AND ms.skill_id = p_skill_id;
  IF v_kind IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先解锁该技能');
  END IF;
  IF p_equipped THEN
    SELECT count(*) INTO v_count FROM public.member_skills ms
    JOIN public.skill_catalog sc ON sc.id = ms.skill_id
    WHERE ms.user_id = v_uid AND ms.equipped AND sc.kind = v_kind;
    IF v_count >= 2 THEN
      RETURN jsonb_build_object('ok', false, 'message', '已达装备上限，请先卸下已有技能/特性');
    END IF;
  END IF;
  UPDATE public.member_skills SET equipped = p_equipped WHERE user_id = v_uid AND skill_id = p_skill_id;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- ============ RPC: 管理员调整队员等级（同步重置活跃度至档位下限）============
CREATE OR REPLACE FUNCTION public.admin_set_level(p_target_uid uuid, p_level integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_activity integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF p_target_uid = auth.uid() THEN RAISE EXCEPTION '不可调整自己'; END IF;
  IF p_level NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION '等级范围1-5'; END IF;
  v_activity := CASE p_level WHEN 1 THEN 0 WHEN 2 THEN 300 WHEN 3 THEN 700 WHEN 4 THEN 1500 ELSE 3000 END;
  UPDATE public.profiles SET activity = v_activity, updated_at = now() WHERE id = p_target_uid;
END $function$;

-- ============ RPC: 管理员手动修正活跃度 ============
CREATE OR REPLACE FUNCTION public.admin_adjust_activity(p_target_uid uuid, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF p_target_uid = auth.uid() THEN RAISE EXCEPTION '不可调整自己'; END IF;
  UPDATE public.profiles SET activity = GREATEST(0, activity + p_delta), updated_at = now() WHERE id = p_target_uid;
END $function$;

-- ============ RPC: 报名时指定席位角色 ============
CREATE OR REPLACE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_act public.activities%ROWTYPE;
  v_role text;
  v_coach_used integer; v_captain_used integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  IF p_seat_role NOT IN ('player','coach','captain') THEN
    RETURN jsonb_build_object('ok', false, 'message', '席位类型无效');
  END IF;
  SELECT * INTO v_act FROM public.activities WHERE id = p_activity_id;
  IF v_act IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', '活动不存在'); END IF;
  SELECT seat_role INTO v_role FROM public.registrations WHERE activity_id = p_activity_id AND user_id = v_uid;
  IF v_role IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '你已报名，请先取消');
  END IF;
  SELECT count(*) INTO v_coach_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role = 'coach';
  SELECT count(*) INTO v_captain_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role = 'captain';
  IF p_seat_role = 'coach' AND v_coach_used >= v_act.coach_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '主教练席位已满');
  END IF;
  IF p_seat_role = 'captain' AND v_captain_used >= v_act.captain_slots THEN
    RETURN jsonb_build_object('ok', false, 'message', '队长席位已满');
  END IF;
  INSERT INTO public.registrations (activity_id, user_id, seat_role)
  VALUES (p_activity_id, v_uid, p_seat_role);
  RETURN jsonb_build_object('ok', true, 'message', '报名成功');
END $function$;