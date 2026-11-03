-- 技能库按 EA FC 26 PlayStyles 全套复刻（member_skills 已确认为空，可安全替换）
DELETE FROM skill_catalog;

-- 特技（动作类 PlayStyles）
INSERT INTO skill_catalog (kind, name, description, cost, sort_order, bonus_key, bonus_value) VALUES
  ('skill', '吊射', '面对出击门将轻巧挑过，四两拨千斤', 300, 1, 'ab_shooting', 2),
  ('skill', '搓射', '禁区角落弧线球兜射远角，门将鞭长莫及', 350, 2, 'ab_shooting', 3),
  ('skill', '大力射门', '蓄力爆射势大力沉，门将来不及反应', 350, 3, 'ab_shooting', 3),
  ('skill', '强力头球', '头球攻门力量与精度兼备，制空终结', 300, 4, 'ab_shooting', 2),
  ('skill', '定位球大师', '任意球点球百步穿杨，一锤定音', 300, 5, 'ab_shooting', 2),
  ('skill', '抢点大师', '禁区内嗅觉敏锐，抢点补射一击致命', 250, 6, 'ab_shooting', 2),
  ('skill', '花式大师', '假射彩虹牛尾巴信手拈来，过人如麻', 350, 7, 'ab_dribbling', 3),
  ('skill', '技术流', '半转身凌空蝎子摆尾，高难度动作不走样', 300, 8, 'ab_dribbling', 2),
  ('skill', '弧线传中', '外脚背弧线传中绕过防线，落点刁钻', 300, 9, 'ab_passing', 2),
  ('skill', '手术刀直塞', '贴地直塞穿透整条防线，一击致命', 350, 10, 'ab_passing', 3),
  ('skill', '长传大师', '四十米长传指哪打哪，转移如精确制导', 300, 11, 'ab_passing', 2),
  ('skill', '快传大师', '一脚出球干净利落，节奏快到犯规', 300, 12, 'ab_passing', 2),
  ('skill', '滑铲专家', '出脚快准狠，铲球干净利落不犯规', 350, 13, 'ab_defending', 3),
  ('skill', '快速出击', '果断弃门出击化解单刀，门前清道夫', 300, 14, 'ab_pace', 2),
  ('skill', '折射扑救', '扑救将球挡向安全区域，二次进攻免谈', 300, 15, 'ab_defending', 2);

-- 特性（风格/身体类 PlayStyles）
INSERT INTO skill_catalog (kind, name, description, cost, sort_order, bonus_key, bonus_value) VALUES
  ('trait', '极速', '短距离冲刺如离弦之箭，边路快马', 350, 1, 'ab_pace', 3),
  ('trait', '快速起步', '启动前三步甩开防守人，一步过掉', 250, 2, 'ab_pace', 2),
  ('trait', '不知疲倦', '全场高强度奔袭无衰减，跑不死', 350, 3, 'ab_stamina', 3),
  ('trait', '强硬对抗', '身体对抗寸土不让，撞不飞顶不住', 300, 4, 'ab_defending', 2),
  ('trait', '缠斗大师', '防守姿态转向如影随形，甩不掉', 300, 5, 'ab_defending', 2),
  ('trait', '拦截大师', '预判传球线路，拦截范围大得离谱', 350, 6, 'ab_defending', 3),
  ('trait', '封堵大师', '舍身封堵射门，人墙般的存在', 300, 7, 'ab_defending', 2),
  ('trait', '停球大师', '长传高空球一停定乾坤，黏在脚下', 250, 8, 'ab_dribbling', 2),
  ('trait', '对抗护球', '背身拿球被围抢也纹丝不动', 300, 9, 'ab_dribbling', 2),
  ('trait', '花式风格', '自带表演属性，动作观赏性拉满', 250, 10, 'ab_dribbling', 2),
  ('trait', '传控大师', '短传渗透行云流水，传跑合拍', 300, 11, 'ab_passing', 2),
  ('trait', '摘高空球', '出击摘传中稳如老狗，高空霸主', 300, 12, 'ab_defending', 2),
  ('trait', '长臂扑救', '扑救覆盖范围惊人，鞭长能及', 300, 13, 'ab_defending', 2),
  ('trait', '快速反应', '近距离射门也能条件反射般扑出', 300, 14, 'ab_defending', 2),
  ('trait', '脚下功夫', '门线技术细腻，脚下扑救反应极快', 250, 15, 'ab_defending', 2),
  ('trait', '远程手抛球', '手抛球发动快攻，直接找到前锋', 250, 16, 'ab_passing', 2);