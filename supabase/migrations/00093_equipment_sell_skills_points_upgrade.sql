-- ① 公告文案统一为 4 小时（更新存量活动）
UPDATE public.activities
SET notice = replace(notice, '开赛3小时前退出接龙可免分摊费用', '开赛4小时前退出接龙可免分摊费用')
WHERE notice LIKE '%开赛3小时前%';

-- ② 放开装备槽位约束（新增球袜/护膝/护腕/补剂）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'equipment_catalog_slot_check' AND t.relname = 'equipment_catalog'
  ) THEN
    ALTER TABLE public.equipment_catalog DROP CONSTRAINT equipment_catalog_slot_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'equipment_catalog_slot_check' AND t.relname = 'equipment_catalog'
  ) THEN
    ALTER TABLE public.equipment_catalog ADD CONSTRAINT equipment_catalog_slot_check
      CHECK (slot IN ('boots','shinpad','gloves','jersey','socks','kneepad','wristband','supplement'));
  END IF;
END $$;

-- ③ 技能/特性接入能力点体系
ALTER TABLE public.skill_catalog
  ADD COLUMN IF NOT EXISTS cost_points integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 3;

UPDATE public.skill_catalog SET cost_points = 3 WHERE rarity = 'gold';

ALTER TABLE public.member_skills
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

-- ④ 解锁改为消耗能力点（与属性加点共用 free_points 资金池）
CREATE OR REPLACE FUNCTION public.unlock_skill(p_skill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost int;
  v_free int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  SELECT cost_points INTO v_cost FROM public.skill_catalog WHERE id = p_skill_id;
  IF v_cost IS NULL THEN RAISE EXCEPTION '技能不存在'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_skills WHERE user_id = v_uid AND skill_id = p_skill_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', '该技能已解锁');
  END IF;
  SELECT free_points INTO v_free FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_free < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'message', '能力点不足，可用活跃度兑换或出勤升级获取');
  END IF;
  UPDATE public.profiles SET free_points = free_points - v_cost, updated_at = now() WHERE id = v_uid;
  INSERT INTO public.member_skills (user_id, skill_id, level) VALUES (v_uid, p_skill_id, 1);
  RETURN jsonb_build_object('ok', true, 'message', '解锁成功');
END $function$;

-- ⑤ 技能/特性升级（每级消耗 cost_points 能力点，加成随等级增长）
CREATE OR REPLACE FUNCTION public.upgrade_skill(p_skill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost int;
  v_max int;
  v_level int;
  v_free int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登录'; END IF;
  SELECT cost_points, max_level INTO v_cost, v_max FROM public.skill_catalog WHERE id = p_skill_id;
  IF v_cost IS NULL THEN RAISE EXCEPTION '技能不存在'; END IF;
  SELECT level INTO v_level FROM public.member_skills WHERE user_id = v_uid AND skill_id = p_skill_id FOR UPDATE;
  IF v_level IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先解锁该技能');
  END IF;
  IF v_level >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'message', '已达最高等级');
  END IF;
  SELECT free_points INTO v_free FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_free < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'message', '能力点不足，可用活跃度兑换或出勤升级获取');
  END IF;
  UPDATE public.profiles SET free_points = free_points - v_cost, updated_at = now() WHERE id = v_uid;
  UPDATE public.member_skills SET level = v_level + 1 WHERE user_id = v_uid AND skill_id = p_skill_id;
  RETURN jsonb_build_object('ok', true, 'message', '升级成功', 'level', v_level + 1);
END $function$;

-- ⑥ 装备原价出售（已装备自动卸下并回收，活跃度全额返还）
CREATE OR REPLACE FUNCTION public.sell_equipment(p_member_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost int;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录');
  END IF;
  SELECT ec.cost, ec.name INTO v_cost, v_name
  FROM public.member_equipment me
  JOIN public.equipment_catalog ec ON ec.id = me.equipment_id
  WHERE me.id = p_member_equipment_id AND me.user_id = v_uid;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '装备记录不存在');
  END IF;
  DELETE FROM public.member_equipment WHERE id = p_member_equipment_id AND user_id = v_uid;
  UPDATE public.profiles SET activity = activity + v_cost, updated_at = now() WHERE id = v_uid;
  RETURN jsonb_build_object('ok', true, 'message', '出售成功', 'refund', v_cost, 'name', v_name);
END $function$;

-- ⑦ 新增装备目录（球袜/护膝/护腕/体能补剂，每槽 4 档）
INSERT INTO public.equipment_catalog (name, slot, rarity, bonuses, effect, icon, cost, sort_order) VALUES
('疾行球袜','socks','bronze','{"ab_stamina":2}','wind_step','i-mdi-sock',100,41),
('赤焰长袜','socks','silver','{"ab_pace":2,"ab_stamina":4}','wind_step','i-mdi-sock',200,42),
('猎豹之袜','socks','gold','{"ab_pace":4,"ab_stamina":6}','wind_step','i-mdi-sock',400,43),
('燃烧小腿','socks','legend','{"ab_pace":6,"ab_stamina":8,"ab_dribbling":3}','lightning','i-mdi-sock',800,44),
('守护护膝','kneepad','bronze','{"ab_defending":2}','iron_wall','i-mdi-shield-half-full',100,51),
('钛金护膝','kneepad','silver','{"ab_defending":4,"ab_stamina":2}','iron_wall','i-mdi-shield-half-full',200,52),
('磐石护膝','kneepad','gold','{"ab_defending":6,"ab_stamina":4}','iron_wall','i-mdi-shield-half-full',400,53),
('不屈之膝','kneepad','legend','{"ab_defending":8,"ab_stamina":6,"ab_pace":2}','iron_wall','i-mdi-shield-half-full',800,54),
('幸运护腕','wristband','bronze','{"ab_passing":2}','golden_touch','i-mdi-watch-variant',100,61),
('节拍器护腕','wristband','silver','{"ab_dribbling":2,"ab_passing":4}','golden_touch','i-mdi-watch-variant',200,62),
('大师护腕','wristband','gold','{"ab_dribbling":4,"ab_passing":6}','golden_touch','i-mdi-watch-variant',400,63),
('传奇腕带','wristband','legend','{"ab_dribbling":6,"ab_passing":8,"ab_shooting":3}','golden_touch','i-mdi-watch-variant',800,64),
('电解质饮料','supplement','bronze','{"ab_stamina":2}','endurance','i-mdi-bottle-tonic-plus',100,71),
('能量胶','supplement','silver','{"ab_stamina":4,"ab_pace":2}','endurance','i-mdi-bottle-tonic-plus',200,72),
('氮泵冲刺','supplement','gold','{"ab_stamina":6,"ab_pace":4}','endurance','i-mdi-bottle-tonic-plus',400,73),
('皇家特调','supplement','legend','{"ab_stamina":8,"ab_pace":6,"ab_defending":3}','endurance','i-mdi-bottle-tonic-plus',800,74);

-- ⑧ 权限
GRANT EXECUTE ON FUNCTION public.upgrade_skill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_equipment(uuid) TO authenticated;