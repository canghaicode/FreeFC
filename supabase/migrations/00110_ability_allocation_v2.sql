-- Ability allocation v2
--
-- Rollback notes:
--   * public.ability_migration_00110_snapshot stores the exact six legacy base
--     values and free_points observed before the one-time reset.
--   * Restoring that snapshot is only safe before any post-migration rewards,
--     purchases, allocations, resets, or position changes. After traffic resumes,
--     restore the pre-migration database backup or reconcile those mutations first;
--     blindly restoring old_free_points would destroy legitimate point changes.
--   * A pre-traffic SQL rollback must first drop the v2 position/allocation
--     triggers and 60-99/NOT NULL/default changes, restore the prior definitions of
--     protect_profile_fields, ability_cap, alloc_points, and the captain setter,
--     then restore all seven profile values from the snapshot and remove the
--     four v2 tables/functions. Prefer the full pre-migration backup.

-- New profiles must start at the v2 base even if one is created while this
-- migration is taking its one-time snapshot.
ALTER TABLE public.profiles
  ALTER COLUMN ab_pace SET DEFAULT 60,
  ALTER COLUMN ab_shooting SET DEFAULT 60,
  ALTER COLUMN ab_passing SET DEFAULT 60,
  ALTER COLUMN ab_dribbling SET DEFAULT 60,
  ALTER COLUMN ab_defending SET DEFAULT 60,
  ALTER COLUMN ab_stamina SET DEFAULT 60;

-- The client never reads this table directly. Profile ab_* columns remain the
-- public base-plus-allocation projection used by existing callers.
CREATE TABLE IF NOT EXISTS public.ability_allocations (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ab_pace integer NOT NULL DEFAULT 0 CHECK (ab_pace BETWEEN 0 AND 39),
  ab_shooting integer NOT NULL DEFAULT 0 CHECK (ab_shooting BETWEEN 0 AND 39),
  ab_passing integer NOT NULL DEFAULT 0 CHECK (ab_passing BETWEEN 0 AND 39),
  ab_dribbling integer NOT NULL DEFAULT 0 CHECK (ab_dribbling BETWEEN 0 AND 39),
  ab_defending integer NOT NULL DEFAULT 0 CHECK (ab_defending BETWEEN 0 AND 39),
  ab_stamina integer NOT NULL DEFAULT 0 CHECK (ab_stamina BETWEEN 0 AND 39),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Explicit privileged free-point overrides are exceptional and auditable.
-- Ordinary self-service mutations conserve free_points + allocated points and
-- therefore never write this table.
CREATE TABLE IF NOT EXISTS public.ability_admin_adjustment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  target_user_id uuid NOT NULL,
  request_role text,
  old_allocated jsonb NOT NULL,
  new_allocated jsonb NOT NULL,
  old_free_points integer NOT NULL,
  new_free_points integer NOT NULL CHECK (new_free_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The state row fixes the first-run population. Re-running this SQL therefore
-- cannot snapshot/refund users created after the migration began.
CREATE TABLE IF NOT EXISTS public.ability_migration_00110_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  snapshot_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ability_migration_00110_snapshot (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_ab_pace integer,
  old_ab_shooting integer,
  old_ab_passing integer,
  old_ab_dribbling integer,
  old_ab_defending integer,
  old_ab_stamina integer,
  old_free_points integer NOT NULL,
  refund_points integer NOT NULL CHECK (refund_points >= 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

-- Serialize the migration marker and lock every profile included in the
-- snapshot before reading any balances. The snapshot/refund therefore uses
-- values current at migration execution even while the application is live.
DO $migration$
DECLARE
  v_snapshot_started_at timestamptz;
  v_row record;
BEGIN
  -- Wait for in-flight profile writers, then prevent new profile mutations for
  -- the snapshot/refund portion of this statement only.
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

  INSERT INTO public.ability_migration_00110_state (singleton)
  VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT snapshot_started_at
  INTO v_snapshot_started_at
  FROM public.ability_migration_00110_state
  WHERE singleton = true
  FOR UPDATE;

  PERFORM 1
  FROM public.profiles p
  WHERE p.created_at <= v_snapshot_started_at
  ORDER BY p.id
  FOR UPDATE;

  INSERT INTO public.ability_migration_00110_snapshot (
    user_id,
    old_ab_pace,
    old_ab_shooting,
    old_ab_passing,
    old_ab_dribbling,
    old_ab_defending,
    old_ab_stamina,
    old_free_points,
    refund_points
  )
  SELECT
    p.id,
    p.ab_pace,
    p.ab_shooting,
    p.ab_passing,
    p.ab_dribbling,
    p.ab_defending,
    p.ab_stamina,
    p.free_points,
    GREATEST(COALESCE(p.ab_pace, 60) - 60, 0)
      + GREATEST(COALESCE(p.ab_shooting, 60) - 60, 0)
      + GREATEST(COALESCE(p.ab_passing, 60) - 60, 0)
      + GREATEST(COALESCE(p.ab_dribbling, 60) - 60, 0)
      + GREATEST(COALESCE(p.ab_defending, 60) - 60, 0)
      + GREATEST(COALESCE(p.ab_stamina, 60) - 60, 0)
  FROM public.profiles p
  WHERE p.created_at <= v_snapshot_started_at
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.ability_allocations (user_id)
  SELECT p.id
  FROM public.profiles p
  ON CONFLICT (user_id) DO NOTHING;

  FOR v_row IN
    SELECT s.user_id, s.refund_points
    FROM public.ability_migration_00110_snapshot s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.applied_at IS NULL
    ORDER BY s.user_id
    FOR UPDATE OF s, p
  LOOP
    UPDATE public.profiles
    SET ab_pace = 60,
        ab_shooting = 60,
        ab_passing = 60,
        ab_dribbling = 60,
        ab_defending = 60,
        ab_stamina = 60,
        free_points = free_points + v_row.refund_points,
        updated_at = now()
    WHERE id = v_row.user_id;

    UPDATE public.ability_migration_00110_snapshot
    SET applied_at = now()
    WHERE user_id = v_row.user_id;
  END LOOP;

  UPDATE public.ability_migration_00110_state
  SET applied_at = COALESCE(applied_at, now())
  WHERE singleton = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.ability_migration_00110_snapshot
      WHERE applied_at IS NULL
    );
END
$migration$;

-- Public profile values are now a strict projection: 60 + authoritative
-- allocation. The dynamic cap is at most 99.
UPDATE public.profiles
SET ab_pace = COALESCE(ab_pace, 60),
    ab_shooting = COALESCE(ab_shooting, 60),
    ab_passing = COALESCE(ab_passing, 60),
    ab_dribbling = COALESCE(ab_dribbling, 60),
    ab_defending = COALESCE(ab_defending, 60),
    ab_stamina = COALESCE(ab_stamina, 60)
WHERE ab_pace IS NULL
   OR ab_shooting IS NULL
   OR ab_passing IS NULL
   OR ab_dribbling IS NULL
   OR ab_defending IS NULL
   OR ab_stamina IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN ab_pace SET NOT NULL,
  ALTER COLUMN ab_shooting SET NOT NULL,
  ALTER COLUMN ab_passing SET NOT NULL,
  ALTER COLUMN ab_dribbling SET NOT NULL,
  ALTER COLUMN ab_defending SET NOT NULL,
  ALTER COLUMN ab_stamina SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_pace_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_shooting_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_passing_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_dribbling_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_defending_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ab_stamina_allocation_range;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_free_points_nonnegative;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ab_pace_allocation_range CHECK (ab_pace BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_ab_shooting_allocation_range CHECK (ab_shooting BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_ab_passing_allocation_range CHECK (ab_passing BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_ab_dribbling_allocation_range CHECK (ab_dribbling BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_ab_defending_allocation_range CHECK (ab_defending BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_ab_stamina_allocation_range CHECK (ab_stamina BETWEEN 60 AND 99),
  ADD CONSTRAINT profiles_free_points_nonnegative CHECK (free_points >= 0);

ALTER TABLE public.ability_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_admin_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_admin_adjustment_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_migration_00110_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_migration_00110_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_migration_00110_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_migration_00110_snapshot FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ability_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ability_admin_adjustment_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ability_migration_00110_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ability_migration_00110_snapshot FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ability_allocations TO service_role;
GRANT ALL ON TABLE public.ability_admin_adjustment_audit TO service_role;
GRANT ALL ON TABLE public.ability_migration_00110_state TO service_role;
GRANT ALL ON TABLE public.ability_migration_00110_snapshot TO service_role;

-- Defense in depth: even an accidental future grant/policy cannot let an
-- ordinary PostgREST role mutate authoritative allocations. current_user is a
-- PostgreSQL execution identity, not a client-controlled request flag.
CREATE OR REPLACE FUNCTION public.guard_ability_allocation_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
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

-- Keep auth-created profiles and the private table in sync.
CREATE OR REPLACE FUNCTION public.initialize_ability_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
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

-- Protect the public projection and free-point balance from direct writes.
-- Existing settlement, exchange, skill, and admin RPCs execute as postgres.
-- service_role must use apply_ability_allocation for protected-value repairs,
-- but retains its legitimate role/non-ability profile administration path.
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
       OR COALESCE(NEW.ab_pace, 60) <> 60
       OR COALESCE(NEW.ab_shooting, 60) <> 60
       OR COALESCE(NEW.ab_passing, 60) <> 60
       OR COALESCE(NEW.ab_dribbling, 60) <> 60
       OR COALESCE(NEW.ab_defending, 60) <> 60
       OR COALESCE(NEW.ab_stamina, 60) <> 60 THEN
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

-- Triggers of the same timing run by name. This trigger intentionally sorts
-- after protect_profile_fields: a client-supplied protected-field change is
-- rejected first, then a legitimate position change performs its own refund.
CREATE OR REPLACE FUNCTION public.reset_allocation_on_position_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_pace integer;
  v_shooting integer;
  v_passing integer;
  v_dribbling integer;
  v_defending integer;
  v_stamina integer;
  v_refund integer;
BEGIN
  IF NEW.preferred_position IS NOT DISTINCT FROM OLD.preferred_position THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ability_allocations (user_id)
  VALUES (OLD.id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina
  INTO v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_stamina
  FROM public.ability_allocations
  WHERE user_id = OLD.id
  FOR UPDATE;

  v_refund := v_pace + v_shooting + v_passing + v_dribbling + v_defending + v_stamina;

  UPDATE public.ability_allocations
  SET ab_pace = 0,
      ab_shooting = 0,
      ab_passing = 0,
      ab_dribbling = 0,
      ab_defending = 0,
      ab_stamina = 0,
      updated_at = now()
  WHERE user_id = OLD.id;

  NEW.ab_pace := 60;
  NEW.ab_shooting := 60;
  NEW.ab_passing := 60;
  NEW.ab_dribbling := 60;
  NEW.ab_defending := 60;
  NEW.ab_stamina := 60;
  NEW.free_points := OLD.free_points + v_refund;
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS zz_reset_allocation_on_position_change ON public.profiles;
CREATE TRIGGER zz_reset_allocation_on_position_change
  BEFORE UPDATE OF preferred_position ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reset_allocation_on_position_change();

-- Only confirmed attendance in settled, non-cancelled activities raises caps.
CREATE OR REPLACE FUNCTION public.ability_valid_appearances(uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT count(*)::integer
  FROM public.registrations r
  JOIN public.activities a
    ON a.id = r.activity_id
   AND a.settled IS TRUE
   AND a.cancelled IS FALSE
  WHERE r.user_id = uid
    AND r.status = 'confirmed';
$function$;

-- Retain the legacy helper signature, but make its attendance authoritative.
CREATE OR REPLACE FUNCTION public.ability_cap(uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT LEAST(
    75 + floor(public.ability_valid_appearances(uid) / 5.0)::integer,
    99
  );
$function$;

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
      COALESCE(aa.ab_pace, 0) AS ab_pace,
      COALESCE(aa.ab_shooting, 0) AS ab_shooting,
      COALESCE(aa.ab_passing, 0) AS ab_passing,
      COALESCE(aa.ab_dribbling, 0) AS ab_dribbling,
      COALESCE(aa.ab_defending, 0) AS ab_defending,
      COALESCE(aa.ab_stamina, 0) AS ab_stamina
    FROM public.profiles p
    LEFT JOIN public.ability_allocations aa ON aa.user_id = p.id
    WHERE p.id = p_user_id
  ),
  state AS (
    SELECT
      player.*,
      public.ability_valid_appearances(p_user_id) AS appearances,
      public.ability_cap(p_user_id) AS central_cap,
      CASE
        WHEN preferred_position = '前锋' OR upper(preferred_position) = 'ST'
          THEN ARRAY[8, 10, 0, 3, -10, -5]
        WHEN preferred_position = '中场' OR upper(preferred_position) = 'CM'
          THEN ARRAY[0, -5, 10, 8, -10, 3]
        WHEN preferred_position = '后卫' OR upper(preferred_position) = 'CB'
          THEN ARRAY[3, -10, 0, -5, 10, 8]
        WHEN preferred_position = '门将' OR upper(preferred_position) = 'GK'
          THEN ARRAY[0, -10, 3, -5, 10, 8]
        ELSE ARRAY[3, 0, 10, 8, -10, -5]
      END AS bonuses
    FROM player
  ),
  caps AS (
    SELECT
      state.*,
      GREATEST(60, LEAST(99, central_cap + bonuses[1]))::integer AS cap_pace,
      GREATEST(60, LEAST(99, central_cap + bonuses[2]))::integer AS cap_shooting,
      GREATEST(60, LEAST(99, central_cap + bonuses[3]))::integer AS cap_passing,
      GREATEST(60, LEAST(99, central_cap + bonuses[4]))::integer AS cap_dribbling,
      GREATEST(60, LEAST(99, central_cap + bonuses[5]))::integer AS cap_defending,
      GREATEST(60, LEAST(99, central_cap + bonuses[6]))::integer AS cap_stamina
    FROM state
  ),
  result AS (
    SELECT
      caps.*,
      floor(0.75 * (
        (cap_pace - 60)
        + (cap_shooting - 60)
        + (cap_passing - 60)
        + (cap_dribbling - 60)
        + (cap_defending - 60)
        + (cap_stamina - 60)
      ))::integer AS budget
    FROM caps
  )
  SELECT jsonb_build_object(
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

-- Internal mutation primitive. It is deliberately not executable by API roles.
-- All mutation paths lock profiles first and ability_allocations second.
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

  IF v_pace > (v_state #>> '{caps,ab_pace}')::integer - 60 THEN
    RAISE EXCEPTION '速度分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_pace}')::integer - 60;
  END IF;
  IF v_shooting > (v_state #>> '{caps,ab_shooting}')::integer - 60 THEN
    RAISE EXCEPTION '射门分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_shooting}')::integer - 60;
  END IF;
  IF v_passing > (v_state #>> '{caps,ab_passing}')::integer - 60 THEN
    RAISE EXCEPTION '传球分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_passing}')::integer - 60;
  END IF;
  IF v_dribbling > (v_state #>> '{caps,ab_dribbling}')::integer - 60 THEN
    RAISE EXCEPTION '盘带分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_dribbling}')::integer - 60;
  END IF;
  IF v_defending > (v_state #>> '{caps,ab_defending}')::integer - 60 THEN
    RAISE EXCEPTION '防守分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_defending}')::integer - 60;
  END IF;
  IF v_stamina > (v_state #>> '{caps,ab_stamina}')::integer - 60 THEN
    RAISE EXCEPTION '体能分配超过当前上限（最多%点）', (v_state #>> '{caps,ab_stamina}')::integer - 60;
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
  SET ab_pace = 60 + v_pace,
      ab_shooting = 60 + v_shooting,
      ab_passing = 60 + v_passing,
      ab_dribbling = 60 + v_dribbling,
      ab_defending = 60 + v_defending,
      ab_stamina = 60 + v_stamina,
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

-- Compatibility for installed clients. It mutates the private allocation and
-- delegates every cap, budget, and conservation check to the v2 primitive.
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
    RAISE EXCEPTION '单项属性不能低于基础值60';
  END IF;

  v_allocated := jsonb_set(v_allocated, ARRAY[p_key], to_jsonb(v_next), false);
  v_result := public.apply_ability_allocation(v_user, v_allocated, NULL);
  RETURN (v_result ->> 'free_points')::integer;
END
$function$;

-- Preserve the captain/admin operation while moving its authoritative state to
-- ability_allocations. Admins may still explicitly override free_points, but
-- six-dimensional values must obey the same v2 caps and budget as everyone else.
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
  v_free_override integer;
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
      IF v_value < 60 OR v_value > 99 THEN
        RAISE EXCEPTION '新体系能力值须在60-99之间';
      END IF;
      v_allocated := jsonb_set(v_allocated, ARRAY[v_key], to_jsonb(v_value - 60), false);
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

REVOKE ALL ON FUNCTION public.guard_ability_allocation_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_ability_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_allocation_on_position_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ability_valid_appearances(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ability_allocation_payload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ability_cap(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_my_ability_allocation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_ability_allocation(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_ability_allocation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alloc_points(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.captain_set_member_abilities(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_ability_allocation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ability_allocation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_ability_allocation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.alloc_points(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.captain_set_member_abilities(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ability_cap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
