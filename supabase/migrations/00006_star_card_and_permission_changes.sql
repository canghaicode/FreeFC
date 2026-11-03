-- ============ 球星卡改造 + 权限调整 ============

-- 1. profiles 表：新增双位置 + 六维能力
ALTER TABLE public.profiles
  ADD COLUMN preferred_position text,
  ADD COLUMN secondary_position text,
  ADD COLUMN ab_shooting integer CHECK (ab_shooting BETWEEN 0 AND 100),
  ADD COLUMN ab_passing integer CHECK (ab_passing BETWEEN 0 AND 100),
  ADD COLUMN ab_dribbling integer CHECK (ab_dribbling BETWEEN 0 AND 100),
  ADD COLUMN ab_defending integer CHECK (ab_defending BETWEEN 0 AND 100),
  ADD COLUMN ab_pace integer CHECK (ab_pace BETWEEN 0 AND 100),
  ADD COLUMN ab_stamina integer CHECK (ab_stamina BETWEEN 0 AND 100);

-- 2. 数据迁移：旧位置 → 首选位置；旧自评能力值 → 六维
UPDATE public.profiles SET preferred_position = position WHERE position IS NOT NULL;
UPDATE public.profiles
  SET ab_shooting = ability_self, ab_passing = ability_self, ab_dribbling = ability_self,
      ab_defending = ability_self, ab_pace = ability_self, ab_stamina = ability_self
  WHERE ability_self IS NOT NULL;

-- 3. 重建 season_stats 视图（改用 preferred_position）
CREATE OR REPLACE VIEW public.season_stats AS
SELECT a.season_id,
  r.user_id,
  p.nickname,
  p.avatar_url,
  p.jersey_number,
  p.preferred_position AS position,
  count(r.id)::integer AS appearances,
  COALESCE(sum(ms.goals), 0::bigint)::integer AS goals,
  COALESCE(sum(ms.assists), 0::bigint)::integer AS assists
FROM registrations r
  JOIN activities a ON a.id = r.activity_id
  JOIN profiles p ON p.id = r.user_id
  LEFT JOIN match_stats ms ON ms.activity_id = r.activity_id AND ms.user_id = r.user_id
GROUP BY a.season_id, r.user_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;

-- 4. 触发器：ability_admin 移除后只保护 role
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE OR REPLACE FUNCTION public.protect_profile_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION '无权修改管理员专属字段';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- 5. 删除旧列
ALTER TABLE public.profiles
  DROP COLUMN position,
  DROP COLUMN ability_self,
  DROP COLUMN ability_admin;

-- 6. activities：全员可发起 + 发起人可管理自己的活动
CREATE POLICY "Members create activities" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Creators manage own activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creators delete own activities" ON public.activities
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- 7. lineups：活动发起人可编辑阵型
CREATE POLICY "Creators manage own activity lineups" ON public.lineups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND a.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND a.created_by = auth.uid()));

-- 8. match_stats：填报必须已报名该场次
CREATE OR REPLACE FUNCTION public.check_report_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.registrations
    WHERE activity_id = NEW.activity_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION '未报名本场活动，无法填报数据';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_match_stats_check_registration
  BEFORE INSERT OR UPDATE ON public.match_stats
  FOR EACH ROW EXECUTE FUNCTION public.check_report_registration();

-- 9. 移除队费模块数据表
DROP TABLE IF EXISTS public.finance_records CASCADE;