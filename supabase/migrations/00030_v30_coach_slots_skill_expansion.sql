-- ============ 1. 技能库清理与扩充 ============
-- 删除重复/易混淆条目（无引用）
DELETE FROM skill_catalog WHERE id IN (
  'e4a18725-e86f-4844-9fe5-c5692c0f2b3c',  -- 马赛回旋（skill 重复，无加成版本）
  'fab9cbbe-964e-4633-9948-737056aa19a7',  -- 领袖气质（trait 重复）
  'ea8c389c-f6f1-4216-9661-097541c65e30'   -- 重炮手（trait，与 skill 重名混淆）
);

-- 新增特技（Skills）
INSERT INTO skill_catalog (kind, name, description, cost, sort_order, bonus_key, bonus_value) VALUES
  ('skill', '圆月弯刀', '任意球与传中弧线如弯月，落点刁钻', 350, 21, 'ab_passing', 3),
  ('skill', '穿云箭', '三十米开外突施冷箭，远射直挂死角', 350, 22, 'ab_shooting', 3),
  ('skill', '蝎子摆尾', '门线杂耍式解围与射门，观赏性拉满', 300, 23, NULL, 0),
  ('skill', '油炸丸子', '双足快速交替横向拨球过人', 300, 24, 'ab_dribbling', 3),
  ('skill', '牛尾巴过人', '单脚内外侧连续变向晃开防守', 250, 25, 'ab_dribbling', 2),
  ('skill', '彩虹过人', '挑球过人形成彩虹弧线羞辱对手', 350, 26, NULL, 0),
  ('skill', '贴身逼抢', '如影随形的贴身压迫逼抢', 250, 27, 'ab_defending', 2),
  ('skill', '卡位大师', '精准预判落点抢先卡住身位', 300, 28, 'ab_defending', 3),
  ('skill', '极限冲刺', '短距离爆发式启动冲刺', 300, 29, 'ab_pace', 3),
  ('skill', '长途奔袭', '从中场一条龙连过数人', 250, 30, 'ab_stamina', 2),
  ('skill', '一击致命', '单刀赴会冷静推射死角', 300, 31, 'ab_shooting', 2),
  ('skill', '电梯球', '任意球急坠如电梯下坠', 400, 32, NULL, 0);

-- 新增特性（Traits）
INSERT INTO skill_catalog (kind, name, description, cost, sort_order, bonus_key, bonus_value) VALUES
  ('trait', '禁区之王', '禁区内终结能力冠绝全队', 300, 11, 'ab_shooting', 3),
  ('trait', '中场发动机', '攻防转换的节拍器与发动机', 300, 12, 'ab_passing', 3),
  ('trait', '后防中坚', '防线定海神针，拦截稳如磐石', 300, 13, 'ab_defending', 3),
  ('trait', '不知疲倦', '全场高强度跑动毫无衰减', 300, 14, 'ab_stamina', 3),
  ('trait', '闪电启动', '启动速度令防守者绝望', 250, 15, 'ab_pace', 2),
  ('trait', '攻防枢纽', '由守转攻第一出球点', 250, 16, 'ab_passing', 2),
  ('trait', '空霸', '制空权收割者，头球轰炸', 250, 17, 'ab_shooting', 2),
  ('trait', '大场面先生', '越关键的比赛发挥越出色', 350, 18, NULL, 0),
  ('trait', '关键先生', '绝杀时刻的最终选项', 300, 19, NULL, 0),
  ('trait', '定海神针', '落后时稳住军心的后防领袖', 300, 20, 'ab_defending', 2);

-- ============ 2. 教练名额按比赛类型自动配置 ============
-- 内战 2 名主教练（A/B 队各一），外战 1 名主教练
CREATE OR REPLACE FUNCTION public.force_coach_slots()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.coach_slots := CASE WHEN NEW.match_type = 'internal' THEN 2 ELSE 1 END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_force_coach_slots ON public.activities;
CREATE TRIGGER trg_force_coach_slots
BEFORE INSERT OR UPDATE OF match_type, coach_slots ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.force_coach_slots();

-- 存量活动刷新
UPDATE public.activities SET coach_slots = CASE WHEN match_type = 'internal' THEN 2 ELSE 1 END;

-- ============ 3. 报名 RPC：队员满员拒绝 + 教练独立名额 ============
CREATE OR REPLACE FUNCTION public.join_with_seat(p_activity_id uuid, p_seat_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_act public.activities%ROWTYPE;
  v_role text;
  v_coach_used integer;
  v_captain_used integer;
  v_player_used integer;
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
  -- 参与队员（普通队员+队长）名额：教练不占名额
  SELECT count(*) INTO v_player_used FROM public.registrations WHERE activity_id = p_activity_id AND seat_role IN ('player','captain');
  IF p_seat_role IN ('player','captain') AND v_player_used >= v_act.max_players THEN
    RETURN jsonb_build_object('ok', false, 'message', '参与队员名额已满，可报名主教练席位');
  END IF;
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