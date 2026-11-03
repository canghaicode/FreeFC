-- ============ profiles 扩展：活力值 ============
ALTER TABLE public.profiles
  ADD COLUMN vitality integer NOT NULL DEFAULT 0 CHECK (vitality >= 0);

-- ============ 装备目录 ============
-- slot: 球鞋/护腿/手套/球衣 四个槽位
-- bonuses: jsonb，六维加成，如 {"ab_pace": 3}
-- effect: 专属特效标识，如 "wind_step"(风之步)/"iron_wall"(铁壁)/"golden_touch"(黄金触感)/"lightning"(闪电)
CREATE TABLE public.equipment_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slot text NOT NULL CHECK (slot IN ('boots','shinpad','gloves','jersey')),
  rarity text NOT NULL DEFAULT 'bronze' CHECK (rarity IN ('bronze','silver','gold','legend')),
  bonuses jsonb NOT NULL DEFAULT '{}'::jsonb,
  effect text NOT NULL DEFAULT '',
  effect_desc text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'i-mdi-tshirt-crew',
  cost integer NOT NULL DEFAULT 100 CHECK (cost >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read equipment catalog" ON public.equipment_catalog FOR SELECT USING (true);

-- 装备种子数据（每槽位多件，含专属特效）
INSERT INTO public.equipment_catalog (name, slot, rarity, bonuses, effect, effect_desc, icon, cost, sort_order) VALUES
-- 球鞋 boots（速度/盘带）
('疾风战靴', 'boots', 'bronze', '{"ab_pace": 2}', 'wind_step', '移动速度小幅提升', 'i-mdi-shoe-sneaker', 100, 1),
('追风者', 'boots', 'silver', '{"ab_pace": 4, "ab_dribbling": 2}', 'wind_step', '移动速度提升，带球更稳', 'i-mdi-shoe-sneaker', 200, 2),
('闪电之翼', 'boots', 'gold', '{"ab_pace": 6, "ab_dribbling": 4}', 'lightning', '闪电特效：冲刺时拖曳电光残影', 'i-mdi-shoe-sneaker', 400, 3),
('神速之靴', 'boots', 'legend', '{"ab_pace": 8, "ab_dribbling": 6, "ab_stamina": 3}', 'lightning', '闪电特效：冲刺时拖曳电光残影，体力消耗降低', 'i-mdi-shoe-sneaker', 800, 4),
-- 护腿 shinpad（防守/体能）
('铁血护腿', 'shinpad', 'bronze', '{"ab_defending": 2}', 'iron_wall', '防守硬度小幅提升', 'i-mdi-shield-outline', 100, 11),
('钢铁壁垒', 'shinpad', 'silver', '{"ab_defending": 4, "ab_stamina": 2}', 'iron_wall', '防守硬度提升，体能更持久', 'i-mdi-shield-outline', 200, 12),
('磐石之心', 'shinpad', 'gold', '{"ab_defending": 6, "ab_stamina": 4}', 'iron_wall', '铁壁特效：防守时泛起金色护盾光晕', 'i-mdi-shield-outline', 400, 13),
('不灭之盾', 'shinpad', 'legend', '{"ab_defending": 8, "ab_stamina": 6, "ab_pace": 2}', 'iron_wall', '铁壁特效：防守时泛起金色护盾光晕，反击更快', 'i-mdi-shield-outline', 800, 14),
-- 手套 gloves（射门/传球）
('精准手套', 'gloves', 'bronze', '{"ab_shooting": 2}', 'golden_touch', '射门精度小幅提升', 'i-mdi-hand-back-right-outline', 100, 21),
('黄金触感', 'gloves', 'silver', '{"ab_shooting": 4, "ab_passing": 2}', 'golden_touch', '射门与传球精度提升', 'i-mdi-hand-back-right-outline', 200, 22),
('魔术师手套', 'gloves', 'gold', '{"ab_shooting": 6, "ab_passing": 4}', 'golden_touch', '黄金触感特效：控球时指尖泛起金光', 'i-mdi-hand-back-right-outline', 400, 23),
('传奇之手', 'gloves', 'legend', '{"ab_shooting": 8, "ab_passing": 6, "ab_dribbling": 3}', 'golden_touch', '黄金触感特效：控球时指尖泛起金光，盘带更细腻', 'i-mdi-hand-back-right-outline', 800, 24),
-- 球衣 jersey（综合/体能）
('透气战袍', 'jersey', 'bronze', '{"ab_stamina": 2}', 'endurance', '体能恢复小幅提升', 'i-mdi-tshirt-crew', 100, 31),
('永动机战袍', 'jersey', 'silver', '{"ab_stamina": 4, "ab_pace": 2}', 'endurance', '体能恢复提升，跑动更轻快', 'i-mdi-tshirt-crew', 200, 32),
('王者战袍', 'jersey', 'gold', '{"ab_stamina": 6, "ab_pace": 4}', 'endurance', '耐力特效：全场飞奔时身披流光', 'i-mdi-tshirt-crew', 400, 33),
('传奇十号', 'jersey', 'legend', '{"ab_stamina": 8, "ab_pace": 6, "ab_passing": 3}', 'endurance', '耐力特效：全场飞奔时身披流光，传球更具穿透力', 'i-mdi-tshirt-crew', 800, 34);

-- ============ 队员已拥有/已装备的装备 ============
CREATE TABLE public.member_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.equipment_catalog(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, equipment_id)
);
CREATE INDEX idx_member_equipment_user ON public.member_equipment(user_id);
ALTER TABLE public.member_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read member_equipment" ON public.member_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own equipment" ON public.member_equipment
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own equipment" ON public.member_equipment
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users delete own equipment" ON public.member_equipment
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ RPC: 购买装备（活力值兑换） ============
-- 校验：活力值充足、未重复拥有、扣活力值、写入拥有记录
CREATE OR REPLACE FUNCTION public.purchase_equipment(p_equipment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_vitality integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  SELECT cost INTO v_cost FROM public.equipment_catalog WHERE id = p_equipment_id;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '装备不存在');
  END IF;
  SELECT vitality INTO v_vitality FROM public.profiles WHERE id = v_uid;
  IF v_vitality < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'message', '活力值不足');
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_equipment WHERE user_id = v_uid AND equipment_id = p_equipment_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', '已拥有该装备');
  END IF;
  UPDATE public.profiles SET vitality = vitality - v_cost, updated_at = now() WHERE id = v_uid;
  INSERT INTO public.member_equipment (user_id, equipment_id, equipped) VALUES (v_uid, p_equipment_id, false);
  RETURN jsonb_build_object('ok', true, 'message', '兑换成功');
END $function$;

-- ============ RPC: 装备/卸下装备（同槽位互斥，自动卸下旧装备） ============
CREATE OR REPLACE FUNCTION public.toggle_equipment(p_member_equipment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.member_equipment;
  v_slot text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  SELECT * INTO v_row FROM public.member_equipment WHERE id = p_member_equipment_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', '装备记录不存在');
  END IF;
  SELECT slot INTO v_slot FROM public.equipment_catalog WHERE id = v_row.equipment_id;
  IF v_row.equipped THEN
    -- 卸下
    UPDATE public.member_equipment SET equipped = false WHERE id = p_member_equipment_id;
    RETURN jsonb_build_object('ok', true, 'message', '已卸下', 'equipped', false);
  ELSE
    -- 装备：先卸下同槽位其他已装备项
    UPDATE public.member_equipment me
      SET equipped = false
      WHERE me.user_id = v_uid AND me.equipped = true
        AND EXISTS (SELECT 1 FROM public.equipment_catalog ec WHERE ec.id = me.equipment_id AND ec.slot = v_slot);
    UPDATE public.member_equipment SET equipped = true WHERE id = p_member_equipment_id;
    RETURN jsonb_build_object('ok', true, 'message', '已装备', 'equipped', true);
  END IF;
END $function$;

-- ============ RPC: 活力值兑换属性点（活力值 → 自由属性点） ============
-- 每点消耗 200 活力值，兑换 1 自由属性点
CREATE OR REPLACE FUNCTION public.exchange_vitality_to_points(p_points integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 200;
  v_total integer;
  v_vitality integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  IF p_points IS NULL OR p_points <= 0 OR p_points > 10 THEN
    RETURN jsonb_build_object('ok', false, 'message', '兑换数量需在1-10之间');
  END IF;
  v_total := v_cost * p_points;
  SELECT vitality INTO v_vitality FROM public.profiles WHERE id = v_uid;
  IF v_vitality < v_total THEN
    RETURN jsonb_build_object('ok', false, 'message', '活力值不足');
  END IF;
  UPDATE public.profiles
    SET vitality = vitality - v_total, free_points = free_points + p_points, updated_at = now()
    WHERE id = v_uid;
  RETURN jsonb_build_object('ok', true, 'message', '兑换成功', 'points', p_points);
END $function$;