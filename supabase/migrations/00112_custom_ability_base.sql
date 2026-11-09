BEGIN;

-- Custom ability bases
--
-- ability_bases is the authoritative six-dimensional base. ability_allocations
-- remains the authoritative growth investment, while profiles.ab_* remains the
-- public base-plus-growth projection used by existing consumers.
CREATE TABLE IF NOT EXISTS public.ability_bases (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ab_pace integer NOT NULL DEFAULT 50,
  ab_shooting integer NOT NULL DEFAULT 50,
  ab_passing integer NOT NULL DEFAULT 50,
  ab_dribbling integer NOT NULL DEFAULT 50,
  ab_defending integer NOT NULL DEFAULT 50,
  ab_stamina integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ability_bases_ab_pace_range CHECK (ab_pace BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_ab_shooting_range CHECK (ab_shooting BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_ab_passing_range CHECK (ab_passing BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_ab_dribbling_range CHECK (ab_dribbling BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_ab_defending_range CHECK (ab_defending BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_ab_stamina_range CHECK (ab_stamina BETWEEN 40 AND 70),
  CONSTRAINT ability_bases_total CHECK (
    ab_pace + ab_shooting + ab_passing + ab_dribbling + ab_defending + ab_stamina = 300
  )
);

-- A durable, private first-run record makes the reset/refund replay-safe and
-- preserves the exact pre-migration profile, projection, inferred old base,
-- authoritative allocation, and point balance for audit.
CREATE TABLE IF NOT EXISTS public.ability_base_migration_00112_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  snapshot_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  profile_count integer NOT NULL DEFAULT 0 CHECK (profile_count >= 0),
  member_skill_ownership_count bigint NOT NULL DEFAULT 0 CHECK (member_skill_ownership_count >= 0),
  member_equipment_ownership_count bigint NOT NULL DEFAULT 0 CHECK (member_equipment_ownership_count >= 0),
  old_free_points_total bigint NOT NULL DEFAULT 0 CHECK (old_free_points_total >= 0),
  old_allocated_points_total bigint NOT NULL DEFAULT 0 CHECK (old_allocated_points_total >= 0),
  refunded_points_total bigint NOT NULL DEFAULT 0 CHECK (refunded_points_total >= 0),
  new_free_points_total bigint NOT NULL DEFAULT 0 CHECK (new_free_points_total >= 0),
  applied_at timestamptz,
  CONSTRAINT ability_base_migration_00112_refund_total CHECK (
    refunded_points_total = old_allocated_points_total
  ),
  CONSTRAINT ability_base_migration_00112_balance_total CHECK (
    new_free_points_total = old_free_points_total + refunded_points_total
  )
);

CREATE TABLE IF NOT EXISTS public.ability_base_migration_00112_snapshot (
  user_id uuid PRIMARY KEY,
  old_profile jsonb NOT NULL CHECK (jsonb_typeof(old_profile) = 'object'),
  old_projected_abilities jsonb NOT NULL CHECK (jsonb_typeof(old_projected_abilities) = 'object'),
  old_base_projection jsonb NOT NULL CHECK (jsonb_typeof(old_base_projection) = 'object'),
  old_allocated jsonb NOT NULL CHECK (jsonb_typeof(old_allocated) = 'object'),
  old_free_points integer NOT NULL CHECK (old_free_points >= 0),
  old_allocated_points integer NOT NULL CHECK (old_allocated_points >= 0),
  refund_points integer NOT NULL CHECK (refund_points >= 0),
  new_base jsonb NOT NULL CHECK (jsonb_typeof(new_base) = 'object'),
  new_free_points integer NOT NULL CHECK (new_free_points >= 0),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz,
  CONSTRAINT ability_base_migration_00112_refund CHECK (
    refund_points = old_allocated_points
  ),
  CONSTRAINT ability_base_migration_00112_balance CHECK (
    new_free_points = old_free_points + refund_points
  )
);

COMMENT ON TABLE public.ability_bases IS
  'Authoritative custom six-dimensional bases; every value is 40-70 and every row totals 300.';
COMMENT ON TABLE public.ability_base_migration_00112_state IS
  'One-time custom-base migration boundary, aggregate conservation proof, and ownership counts.';
COMMENT ON TABLE public.ability_base_migration_00112_snapshot IS
  'Exact pre-00112 profile/projection/base/allocation/free-point state and the one-time reset target.';

ALTER TABLE public.ability_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_bases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_base_migration_00112_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_base_migration_00112_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_base_migration_00112_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_base_migration_00112_snapshot FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ability_bases
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ability_allocations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ability_base_migration_00112_state
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ability_base_migration_00112_snapshot
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ability_bases TO service_role;
GRANT SELECT ON TABLE public.ability_allocations TO service_role;
GRANT SELECT ON TABLE public.ability_base_migration_00112_state TO service_role;
GRANT SELECT ON TABLE public.ability_base_migration_00112_snapshot TO service_role;

-- Direct writes stay unavailable even if a future table grant or RLS policy is
-- added accidentally. Nested deletes are permitted only so profile/auth foreign
-- key cascades can remove the private rows.
CREATE OR REPLACE FUNCTION public.guard_ability_base_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND (pg_trigger_depth() > 1 OR current_user::text = 'supabase_auth_admin') THEN
    RETURN OLD;
  END IF;
  IF current_user::text NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION '能力基础值只能通过受控接口修改';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS guard_ability_base_writes ON public.ability_bases;
CREATE TRIGGER guard_ability_base_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.ability_bases
  FOR EACH ROW EXECUTE FUNCTION public.guard_ability_base_writes();

CREATE OR REPLACE FUNCTION public.guard_ability_allocation_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND (pg_trigger_depth() > 1 OR current_user::text = 'supabase_auth_admin') THEN
    RETURN OLD;
  END IF;
  IF current_user::text NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION '能力分配只能通过受控接口修改';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS guard_ability_allocation_writes ON public.ability_allocations;
CREATE TRIGGER guard_ability_allocation_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.ability_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_ability_allocation_writes();

-- Public projections can now start at any valid custom base and still cannot
-- exceed the existing absolute value ceiling.
ALTER TABLE public.profiles
  ALTER COLUMN ab_pace SET DEFAULT 50,
  ALTER COLUMN ab_shooting SET DEFAULT 50,
  ALTER COLUMN ab_passing SET DEFAULT 50,
  ALTER COLUMN ab_dribbling SET DEFAULT 50,
  ALTER COLUMN ab_defending SET DEFAULT 50,
  ALTER COLUMN ab_stamina SET DEFAULT 50;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_pace_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_shooting_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_passing_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_dribbling_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_defending_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_stamina_allocation_range;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ab_pace_allocation_range CHECK (ab_pace BETWEEN 40 AND 99),
  ADD CONSTRAINT profiles_ab_shooting_allocation_range CHECK (ab_shooting BETWEEN 40 AND 99),
  ADD CONSTRAINT profiles_ab_passing_allocation_range CHECK (ab_passing BETWEEN 40 AND 99),
  ADD CONSTRAINT profiles_ab_dribbling_allocation_range CHECK (ab_dribbling BETWEEN 40 AND 99),
  ADD CONSTRAINT profiles_ab_defending_allocation_range CHECK (ab_defending BETWEEN 40 AND 99),
  ADD CONSTRAINT profiles_ab_stamina_allocation_range CHECK (ab_stamina BETWEEN 40 AND 99);

-- Position is presentation/profile data only. It no longer resets growth or
-- participates in cap calculation.
DROP TRIGGER IF EXISTS zz_reset_allocation_on_position_change ON public.profiles;
DROP FUNCTION IF EXISTS public.reset_allocation_on_position_change();

-- One boundary snapshots every existing member, refunds only authoritative
-- growth allocation, installs the balanced 50 base, and leaves EXP, activity,
-- skills, equipment, and every other profile field untouched.
DO $migration$
DECLARE
  v_applied_at timestamptz;
  v_member_skill_ownership_count bigint;
  v_member_equipment_ownership_count bigint;
BEGIN
  -- Every sanctioned ability/point writer locks profiles first. These locks
  -- drain them in the same order and freeze ownership rows for the audit.
  LOCK TABLE public.profiles IN EXCLUSIVE MODE;
  LOCK TABLE public.ability_bases IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.ability_allocations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.member_skills IN SHARE MODE;
  LOCK TABLE public.member_equipment IN SHARE MODE;

  INSERT INTO public.ability_base_migration_00112_state (
    singleton,
    member_skill_ownership_count,
    member_equipment_ownership_count
  )
  SELECT
    true,
    (SELECT count(*)::bigint FROM public.member_skills),
    (SELECT count(*)::bigint FROM public.member_equipment)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT
    applied_at,
    member_skill_ownership_count,
    member_equipment_ownership_count
  INTO
    v_applied_at,
    v_member_skill_ownership_count,
    v_member_equipment_ownership_count
  FROM public.ability_base_migration_00112_state
  WHERE singleton = true
  FOR UPDATE;

  IF v_applied_at IS NULL THEN
    WITH source AS (
      SELECT
        p.id AS user_id,
        to_jsonb(p) AS old_profile,
        jsonb_build_object(
          'ab_pace', p.ab_pace,
          'ab_shooting', p.ab_shooting,
          'ab_passing', p.ab_passing,
          'ab_dribbling', p.ab_dribbling,
          'ab_defending', p.ab_defending,
          'ab_stamina', p.ab_stamina
        ) AS old_projected_abilities,
        jsonb_build_object(
          'ab_pace', p.ab_pace - COALESCE(aa.ab_pace, 0),
          'ab_shooting', p.ab_shooting - COALESCE(aa.ab_shooting, 0),
          'ab_passing', p.ab_passing - COALESCE(aa.ab_passing, 0),
          'ab_dribbling', p.ab_dribbling - COALESCE(aa.ab_dribbling, 0),
          'ab_defending', p.ab_defending - COALESCE(aa.ab_defending, 0),
          'ab_stamina', p.ab_stamina - COALESCE(aa.ab_stamina, 0)
        ) AS old_base_projection,
        jsonb_build_object(
          'ab_pace', COALESCE(aa.ab_pace, 0),
          'ab_shooting', COALESCE(aa.ab_shooting, 0),
          'ab_passing', COALESCE(aa.ab_passing, 0),
          'ab_dribbling', COALESCE(aa.ab_dribbling, 0),
          'ab_defending', COALESCE(aa.ab_defending, 0),
          'ab_stamina', COALESCE(aa.ab_stamina, 0)
        ) AS old_allocated,
        p.free_points AS old_free_points,
        (
          COALESCE(aa.ab_pace, 0)
          + COALESCE(aa.ab_shooting, 0)
          + COALESCE(aa.ab_passing, 0)
          + COALESCE(aa.ab_dribbling, 0)
          + COALESCE(aa.ab_defending, 0)
          + COALESCE(aa.ab_stamina, 0)
        )::integer AS old_allocated_points
      FROM public.profiles p
      LEFT JOIN public.ability_allocations aa ON aa.user_id = p.id
    )
    INSERT INTO public.ability_base_migration_00112_snapshot (
      user_id,
      old_profile,
      old_projected_abilities,
      old_base_projection,
      old_allocated,
      old_free_points,
      old_allocated_points,
      refund_points,
      new_base,
      new_free_points
    )
    SELECT
      user_id,
      old_profile,
      old_projected_abilities,
      old_base_projection,
      old_allocated,
      old_free_points,
      old_allocated_points,
      old_allocated_points,
      jsonb_build_object(
        'ab_pace', 50,
        'ab_shooting', 50,
        'ab_passing', 50,
        'ab_dribbling', 50,
        'ab_defending', 50,
        'ab_stamina', 50
      ),
      old_free_points + old_allocated_points
    FROM source
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.ability_bases (user_id)
    SELECT p.id
    FROM public.profiles p
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.ability_allocations (user_id)
    SELECT p.id
    FROM public.profiles p
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.ability_bases base
    SET ab_pace = 50,
        ab_shooting = 50,
        ab_passing = 50,
        ab_dribbling = 50,
        ab_defending = 50,
        ab_stamina = 50,
        updated_at = now()
    FROM public.ability_base_migration_00112_snapshot snapshot
    WHERE base.user_id = snapshot.user_id
      AND snapshot.applied_at IS NULL;

    UPDATE public.ability_allocations allocation
    SET ab_pace = 0,
        ab_shooting = 0,
        ab_passing = 0,
        ab_dribbling = 0,
        ab_defending = 0,
        ab_stamina = 0,
        updated_at = now()
    FROM public.ability_base_migration_00112_snapshot snapshot
    WHERE allocation.user_id = snapshot.user_id
      AND snapshot.applied_at IS NULL;

    UPDATE public.profiles profile
    SET ab_pace = 50,
        ab_shooting = 50,
        ab_passing = 50,
        ab_dribbling = 50,
        ab_defending = 50,
        ab_stamina = 50,
        free_points = snapshot.new_free_points,
        updated_at = now()
    FROM public.ability_base_migration_00112_snapshot snapshot
    WHERE profile.id = snapshot.user_id
      AND snapshot.applied_at IS NULL;

    UPDATE public.ability_base_migration_00112_snapshot
    SET applied_at = clock_timestamp()
    WHERE applied_at IS NULL;

    -- Fail atomically if conservation, projection, base, allocation, or any
    -- unrelated profile value differs from the stored migration target.
    IF EXISTS (
      SELECT 1
      FROM public.ability_base_migration_00112_snapshot snapshot
      JOIN public.profiles profile ON profile.id = snapshot.user_id
      LEFT JOIN public.ability_bases base ON base.user_id = snapshot.user_id
      LEFT JOIN public.ability_allocations allocation ON allocation.user_id = snapshot.user_id
      WHERE snapshot.applied_at IS NULL
        OR profile.free_points IS DISTINCT FROM snapshot.new_free_points
        OR profile.ab_pace IS DISTINCT FROM 50
        OR profile.ab_shooting IS DISTINCT FROM 50
        OR profile.ab_passing IS DISTINCT FROM 50
        OR profile.ab_dribbling IS DISTINCT FROM 50
        OR profile.ab_defending IS DISTINCT FROM 50
        OR profile.ab_stamina IS DISTINCT FROM 50
        OR base.ab_pace IS DISTINCT FROM 50
        OR base.ab_shooting IS DISTINCT FROM 50
        OR base.ab_passing IS DISTINCT FROM 50
        OR base.ab_dribbling IS DISTINCT FROM 50
        OR base.ab_defending IS DISTINCT FROM 50
        OR base.ab_stamina IS DISTINCT FROM 50
        OR allocation.ab_pace IS DISTINCT FROM 0
        OR allocation.ab_shooting IS DISTINCT FROM 0
        OR allocation.ab_passing IS DISTINCT FROM 0
        OR allocation.ab_dribbling IS DISTINCT FROM 0
        OR allocation.ab_defending IS DISTINCT FROM 0
        OR allocation.ab_stamina IS DISTINCT FROM 0
        OR (
          to_jsonb(profile) - ARRAY[
            'ab_pace',
            'ab_shooting',
            'ab_passing',
            'ab_dribbling',
            'ab_defending',
            'ab_stamina',
            'free_points',
            'updated_at'
          ]::text[]
        ) IS DISTINCT FROM (
          snapshot.old_profile - ARRAY[
            'ab_pace',
            'ab_shooting',
            'ab_passing',
            'ab_dribbling',
            'ab_defending',
            'ab_stamina',
            'free_points',
            'updated_at'
          ]::text[]
        )
    ) THEN
      RAISE EXCEPTION '自定义基础值迁移后的投影、点数或队员字段不一致';
    END IF;

    IF (SELECT count(*) FROM public.profiles)
       <> (SELECT count(*) FROM public.ability_base_migration_00112_snapshot) THEN
      RAISE EXCEPTION '自定义基础值迁移快照未覆盖全部队员';
    END IF;

    IF (SELECT count(*) FROM public.member_skills)
       <> v_member_skill_ownership_count
       OR (SELECT count(*) FROM public.member_equipment)
       <> v_member_equipment_ownership_count THEN
      RAISE EXCEPTION '自定义基础值迁移期间技能或装备所有权发生变化';
    END IF;

    UPDATE public.ability_base_migration_00112_state state
    SET profile_count = (
          SELECT count(*)::integer
          FROM public.ability_base_migration_00112_snapshot
        ),
        old_free_points_total = COALESCE((
          SELECT sum(old_free_points::bigint)
          FROM public.ability_base_migration_00112_snapshot
        ), 0),
        old_allocated_points_total = COALESCE((
          SELECT sum(old_allocated_points::bigint)
          FROM public.ability_base_migration_00112_snapshot
        ), 0),
        refunded_points_total = COALESCE((
          SELECT sum(refund_points::bigint)
          FROM public.ability_base_migration_00112_snapshot
        ), 0),
        new_free_points_total = COALESCE((
          SELECT sum(new_free_points::bigint)
          FROM public.ability_base_migration_00112_snapshot
        ), 0),
        applied_at = clock_timestamp()
    WHERE state.singleton = true;
  END IF;
END
$migration$;

-- Every future profile gets both private authoritative rows. The profile column
-- defaults already install the matching balanced projection.
CREATE OR REPLACE FUNCTION public.initialize_ability_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  INSERT INTO public.ability_bases (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS zz_initialize_ability_allocation ON public.profiles;
CREATE TRIGGER zz_initialize_ability_allocation
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.initialize_ability_allocation();

-- Keep projections and the shared point balance behind sanctioned SECURITY
-- DEFINER paths. Profile/position edits remain available under their existing
-- policies and never mutate base or growth state.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF current_user::text IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (current_user::text <> 'service_role' AND NEW.role IS DISTINCT FROM 'user'::public.user_role)
       OR COALESCE(NEW.free_points, 0) <> 0
       OR COALESCE(NEW.ab_pace, 50) <> 50
       OR COALESCE(NEW.ab_shooting, 50) <> 50
       OR COALESCE(NEW.ab_passing, 50) <> 50
       OR COALESCE(NEW.ab_dribbling, 50) <> 50
       OR COALESCE(NEW.ab_defending, 50) <> 50
       OR COALESCE(NEW.ab_stamina, 50) <> 50 THEN
      RAISE EXCEPTION '新队员能力值与自由点只能由受控接口初始化';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user::text <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION '无权修改管理员专属字段';
  END IF;

  IF NEW.free_points IS DISTINCT FROM OLD.free_points
     OR NEW.ab_pace IS DISTINCT FROM OLD.ab_pace
     OR NEW.ab_shooting IS DISTINCT FROM OLD.ab_shooting
     OR NEW.ab_passing IS DISTINCT FROM OLD.ab_passing
     OR NEW.ab_dribbling IS DISTINCT FROM OLD.ab_dribbling
     OR NEW.ab_defending IS DISTINCT FROM OLD.ab_defending
     OR NEW.ab_stamina IS DISTINCT FROM OLD.ab_stamina THEN
    RAISE EXCEPTION '能力值与自由点只能通过受控接口修改';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- The growth ceiling is base-relative. The allocation budget deliberately uses
-- the historical central curve and the fixed modifier multiset, independent of
-- both position and custom base.
CREATE OR REPLACE FUNCTION public.ability_allocation_payload(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH player AS (
    SELECT
      p.preferred_position,
      p.free_points,
      COALESCE(base.ab_pace, 50) AS base_pace,
      COALESCE(base.ab_shooting, 50) AS base_shooting,
      COALESCE(base.ab_passing, 50) AS base_passing,
      COALESCE(base.ab_dribbling, 50) AS base_dribbling,
      COALESCE(base.ab_defending, 50) AS base_defending,
      COALESCE(base.ab_stamina, 50) AS base_stamina,
      COALESCE(allocation.ab_pace, 0) AS ab_pace,
      COALESCE(allocation.ab_shooting, 0) AS ab_shooting,
      COALESCE(allocation.ab_passing, 0) AS ab_passing,
      COALESCE(allocation.ab_dribbling, 0) AS ab_dribbling,
      COALESCE(allocation.ab_defending, 0) AS ab_defending,
      COALESCE(allocation.ab_stamina, 0) AS ab_stamina
    FROM public.profiles p
    LEFT JOIN public.ability_bases base ON base.user_id = p.id
    LEFT JOIN public.ability_allocations allocation ON allocation.user_id = p.id
    WHERE p.id = p_user_id
  ),
  state AS (
    SELECT
      player.*,
      public.ability_valid_appearances(p_user_id) AS appearances,
      public.ability_cap(p_user_id) AS central_cap
    FROM player
  ),
  growth AS (
    SELECT
      state.*,
      LEAST(15 + floor(appearances / 5.0)::integer, 39) AS growth_cap
    FROM state
  ),
  caps AS (
    SELECT
      growth.*,
      LEAST(99, base_pace + growth_cap)::integer AS cap_pace,
      LEAST(99, base_shooting + growth_cap)::integer AS cap_shooting,
      LEAST(99, base_passing + growth_cap)::integer AS cap_passing,
      LEAST(99, base_dribbling + growth_cap)::integer AS cap_dribbling,
      LEAST(99, base_defending + growth_cap)::integer AS cap_defending,
      LEAST(99, base_stamina + growth_cap)::integer AS cap_stamina
    FROM growth
  ),
  result AS (
    SELECT
      caps.*,
      floor((
        (GREATEST(60, LEAST(99, central_cap + 10)) - 60)
        + (GREATEST(60, LEAST(99, central_cap + 8)) - 60)
        + (GREATEST(60, LEAST(99, central_cap + 3)) - 60)
        + (GREATEST(60, LEAST(99, central_cap + 0)) - 60)
        + (GREATEST(60, LEAST(99, central_cap - 5)) - 60)
        + (GREATEST(60, LEAST(99, central_cap - 10)) - 60)
      )::numeric / 2)::integer AS budget
    FROM caps
  )
  SELECT jsonb_build_object(
    'base', jsonb_build_object(
      'ab_pace', base_pace,
      'ab_shooting', base_shooting,
      'ab_passing', base_passing,
      'ab_dribbling', base_dribbling,
      'ab_defending', base_defending,
      'ab_stamina', base_stamina
    ),
    'allocated', jsonb_build_object(
      'ab_pace', ab_pace,
      'ab_shooting', ab_shooting,
      'ab_passing', ab_passing,
      'ab_dribbling', ab_dribbling,
      'ab_defending', ab_defending,
      'ab_stamina', ab_stamina
    ),
    'caps', jsonb_build_object(
      'ab_pace', cap_pace,
      'ab_shooting', cap_shooting,
      'ab_passing', cap_passing,
      'ab_dribbling', cap_dribbling,
      'ab_defending', cap_defending,
      'ab_stamina', cap_stamina
    ),
    'budget', budget,
    'free_points', free_points,
    'appearances', appearances,
    'position', preferred_position
  )
  FROM result;
$function$;

-- Internal allocation primitive. All sanctioned mutations serialize in the
-- order profiles -> ability_bases -> ability_allocations.
CREATE OR REPLACE FUNCTION public.apply_ability_allocation(
  p_user_id uuid,
  p_allocated jsonb,
  p_free_points_override integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_keys text[] := ARRAY[
    'ab_pace',
    'ab_shooting',
    'ab_passing',
    'ab_dribbling',
    'ab_defending',
    'ab_stamina'
  ];
  v_key text;
  v_free integer;
  v_new_free integer;
  v_base_pace integer;
  v_base_shooting integer;
  v_base_passing integer;
  v_base_dribbling integer;
  v_base_defending integer;
  v_base_stamina integer;
  v_old_pace integer;
  v_old_shooting integer;
  v_old_passing integer;
  v_old_dribbling integer;
  v_old_defending integer;
  v_old_stamina integer;
  v_pace integer;
  v_shooting integer;
  v_passing integer;
  v_dribbling integer;
  v_defending integer;
  v_stamina integer;
  v_old_total integer;
  v_new_total integer;
  v_state jsonb;
  v_budget integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '队员不存在';
  END IF;
  IF p_allocated IS NULL OR jsonb_typeof(p_allocated) <> 'object' THEN
    RAISE EXCEPTION '能力分配必须是对象';
  END IF;
  IF NOT (p_allocated ?& v_keys)
     OR (SELECT count(*) FROM jsonb_object_keys(p_allocated)) <> 6
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_allocated) AS supplied(key)
       WHERE supplied.key <> ALL (v_keys)
     ) THEN
    RAISE EXCEPTION '能力分配必须且只能包含六个能力维度';
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF jsonb_typeof(p_allocated -> v_key) <> 'number'
       OR (p_allocated ->> v_key) !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION '能力分配 % 必须是整数', v_key;
    END IF;
  END LOOP;

  v_pace := (p_allocated ->> 'ab_pace')::integer;
  v_shooting := (p_allocated ->> 'ab_shooting')::integer;
  v_passing := (p_allocated ->> 'ab_passing')::integer;
  v_dribbling := (p_allocated ->> 'ab_dribbling')::integer;
  v_defending := (p_allocated ->> 'ab_defending')::integer;
  v_stamina := (p_allocated ->> 'ab_stamina')::integer;

  IF v_pace < 0 OR v_shooting < 0 OR v_passing < 0
     OR v_dribbling < 0 OR v_defending < 0 OR v_stamina < 0 THEN
    RAISE EXCEPTION '能力分配不能为负数';
  END IF;

  SELECT free_points
  INTO v_free
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '队员不存在';
  END IF;

  INSERT INTO public.ability_bases (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina
  INTO v_base_pace, v_base_shooting, v_base_passing, v_base_dribbling, v_base_defending, v_base_stamina
  FROM public.ability_bases
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina
  INTO v_old_pace, v_old_shooting, v_old_passing, v_old_dribbling, v_old_defending, v_old_stamina
  FROM public.ability_allocations
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_state := public.ability_allocation_payload(p_user_id);
  v_budget := (v_state ->> 'budget')::integer;

  IF v_pace > (v_state #>> '{caps,ab_pace}')::integer - v_base_pace THEN
    RAISE EXCEPTION '速度分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_pace}')::integer - v_base_pace;
  END IF;
  IF v_shooting > (v_state #>> '{caps,ab_shooting}')::integer - v_base_shooting THEN
    RAISE EXCEPTION '射门分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_shooting}')::integer - v_base_shooting;
  END IF;
  IF v_passing > (v_state #>> '{caps,ab_passing}')::integer - v_base_passing THEN
    RAISE EXCEPTION '传球分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_passing}')::integer - v_base_passing;
  END IF;
  IF v_dribbling > (v_state #>> '{caps,ab_dribbling}')::integer - v_base_dribbling THEN
    RAISE EXCEPTION '盘带分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_dribbling}')::integer - v_base_dribbling;
  END IF;
  IF v_defending > (v_state #>> '{caps,ab_defending}')::integer - v_base_defending THEN
    RAISE EXCEPTION '防守分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_defending}')::integer - v_base_defending;
  END IF;
  IF v_stamina > (v_state #>> '{caps,ab_stamina}')::integer - v_base_stamina THEN
    RAISE EXCEPTION '体能分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_stamina}')::integer - v_base_stamina;
  END IF;

  v_old_total := v_old_pace + v_old_shooting + v_old_passing
    + v_old_dribbling + v_old_defending + v_old_stamina;
  v_new_total := v_pace + v_shooting + v_passing
    + v_dribbling + v_defending + v_stamina;

  IF v_new_total > v_budget THEN
    RAISE EXCEPTION '总分配超过当前预算（已分配%，预算%）', v_new_total, v_budget;
  END IF;

  IF p_free_points_override IS NULL THEN
    v_new_free := v_free + v_old_total - v_new_total;
    IF v_new_free < 0 THEN
      RAISE EXCEPTION '可用属性点不足（还需%点）', -v_new_free;
    END IF;
  ELSE
    IF p_free_points_override < 0 THEN
      RAISE EXCEPTION '自由属性点不能为负数';
    END IF;
    v_new_free := p_free_points_override;
  END IF;

  UPDATE public.ability_allocations
  SET ab_pace = v_pace,
      ab_shooting = v_shooting,
      ab_passing = v_passing,
      ab_dribbling = v_dribbling,
      ab_defending = v_defending,
      ab_stamina = v_stamina,
      updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.profiles
  SET ab_pace = v_base_pace + v_pace,
      ab_shooting = v_base_shooting + v_shooting,
      ab_passing = v_base_passing + v_passing,
      ab_dribbling = v_base_dribbling + v_dribbling,
      ab_defending = v_base_defending + v_defending,
      ab_stamina = v_base_stamina + v_stamina,
      free_points = v_new_free,
      updated_at = now()
  WHERE id = p_user_id;

  IF p_free_points_override IS NOT NULL THEN
    INSERT INTO public.ability_admin_adjustment_audit (
      actor_id,
      target_user_id,
      request_role,
      old_allocated,
      new_allocated,
      old_free_points,
      new_free_points
    )
    VALUES (
      auth.uid(),
      p_user_id,
      COALESCE(NULLIF(current_setting('role', true), 'none'), session_user::text),
      jsonb_build_object(
        'ab_pace', v_old_pace,
        'ab_shooting', v_old_shooting,
        'ab_passing', v_old_passing,
        'ab_dribbling', v_old_dribbling,
        'ab_defending', v_old_defending,
        'ab_stamina', v_old_stamina
      ),
      p_allocated,
      v_free,
      v_new_free
    );
  END IF;

  RETURN public.ability_allocation_payload(p_user_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_my_ability_allocation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  v_result := public.ability_allocation_payload(v_user);
  IF v_result IS NULL THEN
    RAISE EXCEPTION '队员资料不存在';
  END IF;
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.save_ability_allocation(p_allocated jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  RETURN public.apply_ability_allocation(v_user, p_allocated, NULL);
END
$function$;

CREATE OR REPLACE FUNCTION public.reset_ability_allocation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  RETURN public.apply_ability_allocation(
    v_user,
    jsonb_build_object(
      'ab_pace', 0,
      'ab_shooting', 0,
      'ab_passing', 0,
      'ab_dribbling', 0,
      'ab_defending', 0,
      'ab_stamina', 0
    ),
    NULL
  );
END
$function$;

-- Current-user-only base mutation. A changed base atomically refunds all growth
-- and resets it; an identical base returns without touching projection, growth,
-- balance, or timestamps.
CREATE OR REPLACE FUNCTION public.save_ability_base(p_base jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_keys text[] := ARRAY[
    'ab_pace',
    'ab_shooting',
    'ab_passing',
    'ab_dribbling',
    'ab_defending',
    'ab_stamina'
  ];
  v_key text;
  v_free integer;
  v_old_base_pace integer;
  v_old_base_shooting integer;
  v_old_base_passing integer;
  v_old_base_dribbling integer;
  v_old_base_defending integer;
  v_old_base_stamina integer;
  v_allocated_pace integer;
  v_allocated_shooting integer;
  v_allocated_passing integer;
  v_allocated_dribbling integer;
  v_allocated_defending integer;
  v_allocated_stamina integer;
  v_pace integer;
  v_shooting integer;
  v_passing integer;
  v_dribbling integer;
  v_defending integer;
  v_stamina integer;
  v_refund integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  IF p_base IS NULL OR jsonb_typeof(p_base) <> 'object' THEN
    RAISE EXCEPTION '能力基础值必须是对象';
  END IF;
  IF NOT (p_base ?& v_keys)
     OR (SELECT count(*) FROM jsonb_object_keys(p_base)) <> 6
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_base) AS supplied(key)
       WHERE supplied.key <> ALL (v_keys)
     ) THEN
    RAISE EXCEPTION '能力基础值必须且只能包含六个能力维度';
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF jsonb_typeof(p_base -> v_key) <> 'number'
       OR (p_base ->> v_key) !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION '能力基础值 % 必须是整数', v_key;
    END IF;
  END LOOP;

  v_pace := (p_base ->> 'ab_pace')::integer;
  v_shooting := (p_base ->> 'ab_shooting')::integer;
  v_passing := (p_base ->> 'ab_passing')::integer;
  v_dribbling := (p_base ->> 'ab_dribbling')::integer;
  v_defending := (p_base ->> 'ab_defending')::integer;
  v_stamina := (p_base ->> 'ab_stamina')::integer;

  IF v_pace NOT BETWEEN 40 AND 70
     OR v_shooting NOT BETWEEN 40 AND 70
     OR v_passing NOT BETWEEN 40 AND 70
     OR v_dribbling NOT BETWEEN 40 AND 70
     OR v_defending NOT BETWEEN 40 AND 70
     OR v_stamina NOT BETWEEN 40 AND 70 THEN
    RAISE EXCEPTION '每项能力基础值须为40-70之间的整数';
  END IF;
  IF v_pace + v_shooting + v_passing + v_dribbling + v_defending + v_stamina <> 300 THEN
    RAISE EXCEPTION '六项能力基础值合计必须为300';
  END IF;

  SELECT free_points
  INTO v_free
  FROM public.profiles
  WHERE id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '队员资料不存在';
  END IF;

  INSERT INTO public.ability_bases (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina
  INTO v_old_base_pace, v_old_base_shooting, v_old_base_passing, v_old_base_dribbling, v_old_base_defending, v_old_base_stamina
  FROM public.ability_bases
  WHERE user_id = v_user
  FOR UPDATE;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina
  INTO v_allocated_pace, v_allocated_shooting, v_allocated_passing, v_allocated_dribbling, v_allocated_defending, v_allocated_stamina
  FROM public.ability_allocations
  WHERE user_id = v_user
  FOR UPDATE;

  IF v_pace = v_old_base_pace
     AND v_shooting = v_old_base_shooting
     AND v_passing = v_old_base_passing
     AND v_dribbling = v_old_base_dribbling
     AND v_defending = v_old_base_defending
     AND v_stamina = v_old_base_stamina THEN
    RETURN public.ability_allocation_payload(v_user);
  END IF;

  v_refund := v_allocated_pace + v_allocated_shooting + v_allocated_passing
    + v_allocated_dribbling + v_allocated_defending + v_allocated_stamina;

  UPDATE public.ability_bases
  SET ab_pace = v_pace,
      ab_shooting = v_shooting,
      ab_passing = v_passing,
      ab_dribbling = v_dribbling,
      ab_defending = v_defending,
      ab_stamina = v_stamina,
      updated_at = now()
  WHERE user_id = v_user;

  UPDATE public.ability_allocations
  SET ab_pace = 0,
      ab_shooting = 0,
      ab_passing = 0,
      ab_dribbling = 0,
      ab_defending = 0,
      ab_stamina = 0,
      updated_at = now()
  WHERE user_id = v_user;

  UPDATE public.profiles
  SET ab_pace = v_pace,
      ab_shooting = v_shooting,
      ab_passing = v_passing,
      ab_dribbling = v_dribbling,
      ab_defending = v_defending,
      ab_stamina = v_stamina,
      free_points = v_free + v_refund,
      updated_at = now()
  WHERE id = v_user;

  RETURN public.ability_allocation_payload(v_user);
END
$function$;

-- Installed-client +/- compatibility remains growth-only. The profile lock
-- serializes this read/modify/write with base changes.
CREATE OR REPLACE FUNCTION public.alloc_points(p_key text, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_allocated jsonb;
  v_current integer;
  v_next integer;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  IF p_key NOT IN ('ab_pace', 'ab_shooting', 'ab_passing', 'ab_dribbling', 'ab_defending', 'ab_stamina') THEN
    RAISE EXCEPTION '无效的能力维度';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION '加点数值不能为0';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '队员资料不存在';
  END IF;

  INSERT INTO public.ability_bases (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1
  FROM public.ability_bases
  WHERE user_id = v_user
  FOR UPDATE;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT jsonb_build_object(
    'ab_pace', ab_pace,
    'ab_shooting', ab_shooting,
    'ab_passing', ab_passing,
    'ab_dribbling', ab_dribbling,
    'ab_defending', ab_defending,
    'ab_stamina', ab_stamina
  )
  INTO v_allocated
  FROM public.ability_allocations
  WHERE user_id = v_user
  FOR UPDATE;

  v_current := (v_allocated ->> p_key)::integer;
  v_next := v_current + p_delta;
  IF v_next < 0 THEN
    RAISE EXCEPTION '单项属性不能低于自定义基础值';
  END IF;

  v_allocated := jsonb_set(v_allocated, ARRAY[p_key], to_jsonb(v_next), false);
  v_result := public.apply_ability_allocation(v_user, v_allocated, NULL);
  RETURN (v_result ->> 'free_points')::integer;
END
$function$;

-- Captain/admin inputs remain desired public projections. Each supplied value
-- is converted to growth by subtracting the target member's authoritative base;
-- apply_ability_allocation then enforces that member's cap and shared budget.
CREATE OR REPLACE FUNCTION public.captain_set_member_abilities(p_target_uid uuid, p_values jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role public.user_role;
  v_key text;
  v_value integer;
  v_base_value integer;
  v_free_override integer;
  v_base jsonb;
  v_allocated jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION '仅队长/管理员可执行该操作';
  END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION '能力值必须是对象';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_values) AS supplied(key)
    WHERE supplied.key NOT IN (
      'ab_pace',
      'ab_shooting',
      'ab_passing',
      'ab_dribbling',
      'ab_defending',
      'ab_stamina',
      'free_points'
    )
  ) THEN
    RAISE EXCEPTION '包含不支持的能力字段';
  END IF;

  SELECT role
  INTO v_role
  FROM public.profiles
  WHERE id = p_target_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '队员不存在';
  END IF;
  IF p_target_uid = '3dca509b-4ab0-4b83-ad48-f7865eb8c319'::uuid THEN
    RAISE EXCEPTION '永久队长能力值不可调整';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION '不可调整管理员/队长能力值';
  END IF;

  INSERT INTO public.ability_bases (user_id)
  VALUES (p_target_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT jsonb_build_object(
    'ab_pace', ab_pace,
    'ab_shooting', ab_shooting,
    'ab_passing', ab_passing,
    'ab_dribbling', ab_dribbling,
    'ab_defending', ab_defending,
    'ab_stamina', ab_stamina
  )
  INTO v_base
  FROM public.ability_bases
  WHERE user_id = p_target_uid
  FOR UPDATE;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (p_target_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT jsonb_build_object(
    'ab_pace', ab_pace,
    'ab_shooting', ab_shooting,
    'ab_passing', ab_passing,
    'ab_dribbling', ab_dribbling,
    'ab_defending', ab_defending,
    'ab_stamina', ab_stamina
  )
  INTO v_allocated
  FROM public.ability_allocations
  WHERE user_id = p_target_uid
  FOR UPDATE;

  FOREACH v_key IN ARRAY ARRAY[
    'ab_pace',
    'ab_shooting',
    'ab_passing',
    'ab_dribbling',
    'ab_defending',
    'ab_stamina'
  ] LOOP
    IF p_values ? v_key THEN
      IF jsonb_typeof(p_values -> v_key) <> 'number'
         OR (p_values ->> v_key) !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION '能力值 % 必须是整数', v_key;
      END IF;
      v_value := (p_values ->> v_key)::integer;
      v_base_value := (v_base ->> v_key)::integer;
      IF v_value < v_base_value OR v_value > 99 THEN
        RAISE EXCEPTION '能力投影 % 须在该项基础值%与99之间', v_key, v_base_value;
      END IF;
      v_allocated := jsonb_set(
        v_allocated,
        ARRAY[v_key],
        to_jsonb(v_value - v_base_value),
        false
      );
    END IF;
  END LOOP;

  IF p_values ? 'free_points' THEN
    IF jsonb_typeof(p_values -> 'free_points') <> 'number'
       OR (p_values ->> 'free_points') !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION '自由属性点必须是整数';
    END IF;
    v_free_override := (p_values ->> 'free_points')::integer;
    IF v_free_override < 0 THEN
      RAISE EXCEPTION '自由属性点不能为负数';
    END IF;
  END IF;

  PERFORM public.apply_ability_allocation(
    p_target_uid,
    v_allocated,
    v_free_override
  );
END
$function$;

-- Internal functions and private tables are never API mutation surfaces.
REVOKE ALL ON FUNCTION public.guard_ability_base_writes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_ability_allocation_writes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.initialize_ability_allocation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_profile_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ability_valid_appearances(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ability_allocation_payload(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ability_cap(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_ability_allocation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_ability_allocation(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reset_ability_allocation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_ability_base(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.alloc_points(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.captain_set_member_abilities(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ability_cap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_ability_allocation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ability_allocation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_ability_allocation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ability_base(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alloc_points(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.captain_set_member_abilities(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
