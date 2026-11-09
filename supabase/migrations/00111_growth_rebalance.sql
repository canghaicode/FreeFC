BEGIN;

-- Growth rebalance
--
-- The EXP level curve is independent from activity rank:
--   threshold(level) = exp_per_level * level * (level - 1) / 2
-- Level 1 starts at zero EXP, and advancing L -> L + 1 costs
-- exp_per_level * L additional EXP.
--
-- The one-time balance migration intentionally does not reconstruct historical
-- activity-to-point exchanges: no durable exchange ledger exists. It preserves
-- unexplained net point assets with this auditable identity:
--   new_free = max(0,
--     old_free + old_allocated - old_linear_upgrade_income
--     + new_curve_upgrade_income)
-- Existing skill ownership/spend therefore cancels from the balance adjustment.
-- Current-price skill spend and residual assets are recorded for information
-- only; they are not asserted to be historical purchase prices.

CREATE OR REPLACE FUNCTION public.growth_exp_threshold(
  p_level integer,
  p_exp_per_level integer
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_level < 1 THEN
    RAISE EXCEPTION '经验等级不能低于1';
  END IF;
  IF p_exp_per_level <= 0 THEN
    RAISE EXCEPTION '每级经验必须为正数';
  END IF;

  RETURN (
    p_exp_per_level::numeric
      * p_level::numeric
      * (p_level - 1)::numeric
      / 2
  )::bigint;
END
$function$;

CREATE OR REPLACE FUNCTION public.growth_level_for_exp(
  p_exp bigint,
  p_exp_per_level integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_exp bigint := GREATEST(p_exp, 0);
  v_level integer;
BEGIN
  IF p_exp_per_level <= 0 THEN
    RAISE EXCEPTION '每级经验必须为正数';
  END IF;

  -- The closed-form inverse is corrected against the exact integer threshold
  -- below, so numeric square-root rounding can never move a boundary.
  v_level := GREATEST(
    1,
    floor(
      (
        1
        + sqrt(
          1
          + 8 * v_exp::numeric / p_exp_per_level::numeric
        )
      ) / 2
    )::integer
  );

  WHILE public.growth_exp_threshold(v_level + 1, p_exp_per_level) <= v_exp LOOP
    v_level := v_level + 1;
  END LOOP;
  WHILE v_level > 1
    AND public.growth_exp_threshold(v_level, p_exp_per_level) > v_exp
  LOOP
    v_level := v_level - 1;
  END LOOP;

  RETURN v_level;
END
$function$;

COMMENT ON FUNCTION public.growth_exp_threshold(integer, integer) IS
  'Exact cumulative EXP threshold for a 1-based triangular growth level.';
COMMENT ON FUNCTION public.growth_level_for_exp(bigint, integer) IS
  'Exact 1-based growth level for EXP under the triangular growth curve.';

REVOKE ALL ON FUNCTION public.growth_exp_threshold(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_level_for_exp(bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_exp_threshold(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_level_for_exp(bigint, integer)
  TO service_role;

-- Preserve the 00110 payload shape and projection source. Only the allocation
-- budget changes, from 75% to floor(total available capacity * 50%).
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
      floor(0.50 * (
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

REVOKE ALL ON FUNCTION public.ability_allocation_payload(uuid)
  FROM PUBLIC, anon, authenticated;

-- Private, append-only-in-practice migration records. API roles have no policy
-- and no table privileges; service_role can inspect but not mutate them.
CREATE TABLE IF NOT EXISTS public.growth_migration_00111_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  snapshot_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  old_growth_config jsonb NOT NULL,
  old_exp_per_level integer NOT NULL CHECK (old_exp_per_level > 0),
  old_points_per_level integer NOT NULL CHECK (old_points_per_level > 0),
  profile_count integer NOT NULL DEFAULT 0 CHECK (profile_count >= 0),
  equipment_catalog_count integer NOT NULL DEFAULT 0 CHECK (equipment_catalog_count >= 0),
  equipment_changed_count integer NOT NULL DEFAULT 0 CHECK (equipment_changed_count >= 0),
  skill_catalog_count integer NOT NULL DEFAULT 0 CHECK (skill_catalog_count >= 0),
  skill_changed_count integer NOT NULL DEFAULT 0 CHECK (skill_changed_count >= 0),
  old_free_points_total bigint NOT NULL DEFAULT 0,
  old_allocated_points_total bigint NOT NULL DEFAULT 0,
  old_point_assets_total bigint NOT NULL DEFAULT 0,
  old_upgrade_income_total bigint NOT NULL DEFAULT 0,
  new_upgrade_income_total bigint NOT NULL DEFAULT 0,
  income_adjustment_total bigint NOT NULL DEFAULT 0,
  subsidy_points_total bigint NOT NULL DEFAULT 0 CHECK (subsidy_points_total >= 0),
  new_free_points_total bigint NOT NULL DEFAULT 0 CHECK (new_free_points_total >= 0),
  informational_skill_spend_total bigint NOT NULL DEFAULT 0,
  informational_residual_assets_total bigint NOT NULL DEFAULT 0,
  applied_growth_config jsonb,
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.growth_migration_00111_profile_snapshot (
  user_id uuid PRIMARY KEY,
  old_exp integer NOT NULL,
  old_activity integer NOT NULL,
  old_free_points integer NOT NULL,
  old_projected_abilities jsonb NOT NULL,
  old_allocated jsonb NOT NULL,
  old_allocated_points integer NOT NULL CHECK (old_allocated_points >= 0),
  old_point_assets bigint NOT NULL,
  old_exp_per_level integer NOT NULL CHECK (old_exp_per_level > 0),
  old_points_per_level integer NOT NULL CHECK (old_points_per_level > 0),
  old_upgrade_income bigint NOT NULL,
  new_level integer NOT NULL CHECK (new_level >= 1),
  new_upgrade_income bigint NOT NULL CHECK (new_upgrade_income >= 0),
  income_adjustment bigint NOT NULL,
  raw_rebalanced_free_points bigint NOT NULL,
  subsidy_points bigint NOT NULL CHECK (subsidy_points >= 0),
  new_free_points integer NOT NULL CHECK (new_free_points >= 0),
  informational_current_skill_price_spend bigint NOT NULL CHECK (informational_current_skill_price_spend >= 0),
  informational_residual_assets bigint NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.growth_migration_00111_equipment_catalog_snapshot (
  equipment_id uuid PRIMARY KEY,
  old_row jsonb NOT NULL,
  old_bonuses jsonb NOT NULL,
  new_bonuses jsonb NOT NULL,
  changed boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.growth_migration_00111_skill_catalog_snapshot (
  skill_id uuid PRIMARY KEY,
  old_row jsonb NOT NULL,
  old_bonus_value integer NOT NULL,
  new_bonus_value integer NOT NULL,
  changed boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz
);

COMMENT ON TABLE public.growth_migration_00111_profile_snapshot IS
  'One-time growth rebalance inputs, algebra, and outputs for every profile present at the migration boundary.';
COMMENT ON COLUMN public.growth_migration_00111_profile_snapshot.informational_current_skill_price_spend IS
  'Owned skill levels valued at catalogue prices at migration time; not a historical exchange ledger.';
COMMENT ON COLUMN public.growth_migration_00111_profile_snapshot.informational_residual_assets IS
  'old_free + old_allocated + current-price skill spend - old upgrade income; informational only.';
COMMENT ON TABLE public.growth_migration_00111_equipment_catalog_snapshot IS
  'Complete pre-calibration equipment catalogue rows plus the one-time transformed bonuses.';
COMMENT ON TABLE public.growth_migration_00111_skill_catalog_snapshot IS
  'Complete pre-calibration skill catalogue rows plus the one-time transformed bonus value.';

ALTER TABLE public.growth_migration_00111_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_profile_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_profile_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_equipment_catalog_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_equipment_catalog_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_skill_catalog_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_migration_00111_skill_catalog_snapshot FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.growth_migration_00111_state
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.growth_migration_00111_profile_snapshot
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.growth_migration_00111_equipment_catalog_snapshot
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.growth_migration_00111_skill_catalog_snapshot
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.growth_migration_00111_state TO service_role;
GRANT SELECT ON TABLE public.growth_migration_00111_profile_snapshot TO service_role;
GRANT SELECT ON TABLE public.growth_migration_00111_equipment_catalog_snapshot TO service_role;
GRANT SELECT ON TABLE public.growth_migration_00111_skill_catalog_snapshot TO service_role;

-- One migration boundary covers profile balances, authoritative allocations,
-- catalogues, and ownership rows. Ownership rows are locked but never updated.
DO $migration$
DECLARE
  v_snapshot_started_at timestamptz;
  v_old_exp_per_level integer;
  v_old_points_per_level integer;
  v_state_applied_at timestamptz;
  v_profile record;
  v_ability_keys text[] := ARRAY[
    'ab_pace',
    'ab_shooting',
    'ab_passing',
    'ab_dribbling',
    'ab_defending',
    'ab_stamina'
  ];
BEGIN
  -- EXCLUSIVE blocks SELECT FOR UPDATE as well as writes, draining every
  -- sanctioned point/skill writer before the snapshot and reset begin.
  LOCK TABLE public.profiles IN EXCLUSIVE MODE;
  LOCK TABLE public.growth_config IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.ability_allocations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.skill_catalog IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.equipment_catalog IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.member_skills IN SHARE MODE;
  LOCK TABLE public.member_equipment IN SHARE MODE;

  INSERT INTO public.growth_migration_00111_state (
    singleton,
    old_growth_config,
    old_exp_per_level,
    old_points_per_level
  )
  SELECT
    true,
    to_jsonb(gc),
    gc.exp_per_level,
    gc.points_per_level
  FROM public.growth_config gc
  WHERE gc.id = 1
  ON CONFLICT (singleton) DO NOTHING;

  SELECT
    snapshot_started_at,
    old_exp_per_level,
    old_points_per_level,
    applied_at
  INTO
    v_snapshot_started_at,
    v_old_exp_per_level,
    v_old_points_per_level,
    v_state_applied_at
  FROM public.growth_migration_00111_state
  WHERE singleton = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '成长配置不存在，无法执行成长重平衡';
  END IF;

  IF v_state_applied_at IS NULL THEN
    -- Snapshot every catalogue row present at the first migration boundary.
    -- Only positive values on the six recognized ability keys are calibrated;
    -- unknown keys and non-positive/non-numeric values remain byte-for-byte
    -- equivalent as JSON values.
    WITH calibrated AS (
      SELECT
        ec.id AS equipment_id,
        to_jsonb(ec) AS old_row,
        ec.bonuses AS old_bonuses,
        COALESCE(
          (
            SELECT jsonb_object_agg(
              entry.key,
              CASE
                WHEN entry.key = ANY (v_ability_keys)
                  AND jsonb_typeof(entry.value) = 'number'
                  AND entry.value::text::numeric > 0
                THEN to_jsonb(
                  GREATEST(
                    1,
                    round(entry.value::text::numeric / 4)
                  )::integer
                )
                ELSE entry.value
              END
            )
            FROM jsonb_each(ec.bonuses) AS entry(key, value)
          ),
          '{}'::jsonb
        ) AS new_bonuses
      FROM public.equipment_catalog ec
      WHERE ec.created_at <= v_snapshot_started_at
    )
    INSERT INTO public.growth_migration_00111_equipment_catalog_snapshot (
      equipment_id,
      old_row,
      old_bonuses,
      new_bonuses,
      changed
    )
    SELECT
      equipment_id,
      old_row,
      old_bonuses,
      new_bonuses,
      old_bonuses IS DISTINCT FROM new_bonuses
    FROM calibrated
    ON CONFLICT (equipment_id) DO NOTHING;

    INSERT INTO public.growth_migration_00111_skill_catalog_snapshot (
      skill_id,
      old_row,
      old_bonus_value,
      new_bonus_value,
      changed
    )
    SELECT
      sc.id,
      to_jsonb(sc),
      sc.bonus_value,
      CASE sc.bonus_value
        WHEN 2 THEN 1
        WHEN 3 THEN 2
        ELSE sc.bonus_value
      END,
      sc.bonus_value IN (2, 3)
    FROM public.skill_catalog sc
    WHERE sc.created_at <= v_snapshot_started_at
    ON CONFLICT (skill_id) DO NOTHING;

    -- Snapshot authoritative point allocation, public projection, EXP/activity,
    -- both income curves, subsidy, and informational current-price skill spend.
    WITH source AS (
      SELECT
        p.id AS user_id,
        p.exp AS old_exp,
        p.activity AS old_activity,
        p.free_points AS old_free_points,
        jsonb_build_object(
          'ab_pace', p.ab_pace,
          'ab_shooting', p.ab_shooting,
          'ab_passing', p.ab_passing,
          'ab_dribbling', p.ab_dribbling,
          'ab_defending', p.ab_defending,
          'ab_stamina', p.ab_stamina
        ) AS old_projected_abilities,
        jsonb_build_object(
          'ab_pace', COALESCE(aa.ab_pace, 0),
          'ab_shooting', COALESCE(aa.ab_shooting, 0),
          'ab_passing', COALESCE(aa.ab_passing, 0),
          'ab_dribbling', COALESCE(aa.ab_dribbling, 0),
          'ab_defending', COALESCE(aa.ab_defending, 0),
          'ab_stamina', COALESCE(aa.ab_stamina, 0)
        ) AS old_allocated,
        (
          COALESCE(aa.ab_pace, 0)
          + COALESCE(aa.ab_shooting, 0)
          + COALESCE(aa.ab_passing, 0)
          + COALESCE(aa.ab_dribbling, 0)
          + COALESCE(aa.ab_defending, 0)
          + COALESCE(aa.ab_stamina, 0)
        )::integer AS old_allocated_points,
        skill_spend.current_price_spend
          AS informational_current_skill_price_spend
      FROM public.profiles p
      LEFT JOIN public.ability_allocations aa ON aa.user_id = p.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          sum(sc.cost_points::bigint * ms.level::bigint),
          0::numeric
        )::bigint AS current_price_spend
        FROM public.member_skills ms
        JOIN public.skill_catalog sc ON sc.id = ms.skill_id
        WHERE ms.user_id = p.id
      ) skill_spend ON true
      WHERE p.created_at <= v_snapshot_started_at
    ),
    incomes AS (
      SELECT
        source.*,
        source.old_free_points::bigint
          + source.old_allocated_points::bigint AS old_point_assets,
        floor(
          source.old_exp::numeric / v_old_exp_per_level::numeric
        )::bigint * v_old_points_per_level::bigint AS old_upgrade_income,
        public.growth_level_for_exp(
          source.old_exp::bigint,
          v_old_exp_per_level
        ) AS new_level
      FROM source
    ),
    adjusted AS (
      SELECT
        incomes.*,
        (incomes.new_level - 1)::bigint * 5::bigint
          AS new_upgrade_income
      FROM incomes
    ),
    balanced AS (
      SELECT
        adjusted.*,
        adjusted.new_upgrade_income - adjusted.old_upgrade_income
          AS income_adjustment,
        adjusted.old_point_assets
          - adjusted.old_upgrade_income
          + adjusted.new_upgrade_income
          AS raw_rebalanced_free_points,
        adjusted.old_point_assets
          + adjusted.informational_current_skill_price_spend
          - adjusted.old_upgrade_income
          AS informational_residual_assets
      FROM adjusted
    )
    INSERT INTO public.growth_migration_00111_profile_snapshot (
      user_id,
      old_exp,
      old_activity,
      old_free_points,
      old_projected_abilities,
      old_allocated,
      old_allocated_points,
      old_point_assets,
      old_exp_per_level,
      old_points_per_level,
      old_upgrade_income,
      new_level,
      new_upgrade_income,
      income_adjustment,
      raw_rebalanced_free_points,
      subsidy_points,
      new_free_points,
      informational_current_skill_price_spend,
      informational_residual_assets
    )
    SELECT
      user_id,
      old_exp,
      old_activity,
      old_free_points,
      old_projected_abilities,
      old_allocated,
      old_allocated_points,
      old_point_assets,
      v_old_exp_per_level,
      v_old_points_per_level,
      old_upgrade_income,
      new_level,
      new_upgrade_income,
      income_adjustment,
      raw_rebalanced_free_points,
      GREATEST(0::bigint, -raw_rebalanced_free_points),
      GREATEST(0::bigint, raw_rebalanced_free_points)::integer,
      informational_current_skill_price_spend,
      informational_residual_assets
    FROM balanced
    ON CONFLICT (user_id) DO NOTHING;

    -- Apply stored target values, never a second transformation of live values.
    -- This makes a retry safe even if an operator replays the file.
    UPDATE public.equipment_catalog ec
    SET bonuses = snapshot.new_bonuses
    FROM public.growth_migration_00111_equipment_catalog_snapshot snapshot
    WHERE snapshot.equipment_id = ec.id
      AND snapshot.applied_at IS NULL
      AND ec.bonuses IS DISTINCT FROM snapshot.new_bonuses;

    UPDATE public.skill_catalog sc
    SET bonus_value = snapshot.new_bonus_value
    FROM public.growth_migration_00111_skill_catalog_snapshot snapshot
    WHERE snapshot.skill_id = sc.id
      AND snapshot.applied_at IS NULL
      AND sc.bonus_value IS DISTINCT FROM snapshot.new_bonus_value;

    UPDATE public.growth_config
    SET points_per_level = 5,
        updated_at = CASE
          WHEN points_per_level IS DISTINCT FROM 5 THEN now()
          ELSE updated_at
        END
    WHERE id = 1;

    -- Reset all six base allocations and write the reconciled point balance only
    -- through the sanctioned 00110 primitive. That primitive also records the
    -- privileged override in ability_admin_adjustment_audit.
    FOR v_profile IN
      SELECT user_id, new_free_points
      FROM public.growth_migration_00111_profile_snapshot
      WHERE applied_at IS NULL
      ORDER BY user_id
    LOOP
      PERFORM public.apply_ability_allocation(
        v_profile.user_id,
        jsonb_build_object(
          'ab_pace', 0,
          'ab_shooting', 0,
          'ab_passing', 0,
          'ab_dribbling', 0,
          'ab_defending', 0,
          'ab_stamina', 0
        ),
        v_profile.new_free_points
      );

      UPDATE public.growth_migration_00111_profile_snapshot
      SET applied_at = clock_timestamp()
      WHERE user_id = v_profile.user_id;
    END LOOP;

    -- Fail the transaction rather than leave a projection, preserved balance,
    -- or stored catalogue target inconsistent with its snapshot.
    IF EXISTS (
      SELECT 1
      FROM public.growth_migration_00111_profile_snapshot snapshot
      JOIN public.profiles p ON p.id = snapshot.user_id
      LEFT JOIN public.ability_allocations aa ON aa.user_id = snapshot.user_id
      WHERE snapshot.applied_at IS NULL
        OR p.exp IS DISTINCT FROM snapshot.old_exp
        OR p.activity IS DISTINCT FROM snapshot.old_activity
        OR p.free_points IS DISTINCT FROM snapshot.new_free_points
        OR p.ab_pace IS DISTINCT FROM 60
        OR p.ab_shooting IS DISTINCT FROM 60
        OR p.ab_passing IS DISTINCT FROM 60
        OR p.ab_dribbling IS DISTINCT FROM 60
        OR p.ab_defending IS DISTINCT FROM 60
        OR p.ab_stamina IS DISTINCT FROM 60
        OR COALESCE(aa.ab_pace, -1) <> 0
        OR COALESCE(aa.ab_shooting, -1) <> 0
        OR COALESCE(aa.ab_passing, -1) <> 0
        OR COALESCE(aa.ab_dribbling, -1) <> 0
        OR COALESCE(aa.ab_defending, -1) <> 0
        OR COALESCE(aa.ab_stamina, -1) <> 0
    ) THEN
      RAISE EXCEPTION '成长重平衡后的能力投影或点数不一致';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.growth_migration_00111_equipment_catalog_snapshot snapshot
      JOIN public.equipment_catalog ec ON ec.id = snapshot.equipment_id
      WHERE ec.bonuses IS DISTINCT FROM snapshot.new_bonuses
    ) THEN
      RAISE EXCEPTION '装备目录校准结果与快照不一致';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.growth_migration_00111_skill_catalog_snapshot snapshot
      JOIN public.skill_catalog sc ON sc.id = snapshot.skill_id
      WHERE sc.bonus_value IS DISTINCT FROM snapshot.new_bonus_value
    ) THEN
      RAISE EXCEPTION '技能目录校准结果与快照不一致';
    END IF;

    UPDATE public.growth_migration_00111_equipment_catalog_snapshot
    SET applied_at = COALESCE(applied_at, clock_timestamp());

    UPDATE public.growth_migration_00111_skill_catalog_snapshot
    SET applied_at = COALESCE(applied_at, clock_timestamp());

    UPDATE public.growth_migration_00111_state state
    SET profile_count = (
          SELECT count(*)::integer
          FROM public.growth_migration_00111_profile_snapshot
        ),
        equipment_catalog_count = (
          SELECT count(*)::integer
          FROM public.growth_migration_00111_equipment_catalog_snapshot
        ),
        equipment_changed_count = (
          SELECT count(*)::integer
          FROM public.growth_migration_00111_equipment_catalog_snapshot
          WHERE changed
        ),
        skill_catalog_count = (
          SELECT count(*)::integer
          FROM public.growth_migration_00111_skill_catalog_snapshot
        ),
        skill_changed_count = (
          SELECT count(*)::integer
          FROM public.growth_migration_00111_skill_catalog_snapshot
          WHERE changed
        ),
        old_free_points_total = COALESCE((
          SELECT sum(old_free_points::bigint)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        old_allocated_points_total = COALESCE((
          SELECT sum(old_allocated_points::bigint)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        old_point_assets_total = COALESCE((
          SELECT sum(old_point_assets)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        old_upgrade_income_total = COALESCE((
          SELECT sum(old_upgrade_income)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        new_upgrade_income_total = COALESCE((
          SELECT sum(new_upgrade_income)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        income_adjustment_total = COALESCE((
          SELECT sum(income_adjustment)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        subsidy_points_total = COALESCE((
          SELECT sum(subsidy_points)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        new_free_points_total = COALESCE((
          SELECT sum(new_free_points::bigint)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        informational_skill_spend_total = COALESCE((
          SELECT sum(informational_current_skill_price_spend)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        informational_residual_assets_total = COALESCE((
          SELECT sum(informational_residual_assets)
          FROM public.growth_migration_00111_profile_snapshot
        ), 0),
        applied_growth_config = (
          SELECT to_jsonb(gc)
          FROM public.growth_config gc
          WHERE gc.id = 1
        ),
        applied_at = clock_timestamp()
    WHERE state.singleton = true;
  END IF;
END
$migration$;

-- Reward size is a fixed rule, not an administrator-tunable economy input.
UPDATE public.growth_config
SET points_per_level = 5,
    updated_at = CASE
      WHEN points_per_level IS DISTINCT FROM 5 THEN now()
      ELSE updated_at
    END
WHERE id = 1;

ALTER TABLE public.growth_config
  ALTER COLUMN points_per_level SET DEFAULT 5;
ALTER TABLE public.growth_config
  DROP CONSTRAINT IF EXISTS growth_config_points_per_level_check;
ALTER TABLE public.growth_config
  ADD CONSTRAINT growth_config_points_per_level_check
  CHECK (points_per_level = 5);

-- Preserve every behavioral choice in the current 00090 settlement definition:
-- caller authorization, settled/cancelled idempotency, confirmed participants,
-- MVP/defender selection, and all EXP/activity bonus amounts. Only the EXP level
-- calculation and fixed five-point level reward change.
CREATE OR REPLACE FUNCTION public.settle_activity_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  r record;
  v_old_exp integer;
  v_new_exp integer;
  v_old_level integer;
  v_new_level integer;
  v_cfg public.growth_config%ROWTYPE;
  v_mvp uuid[];
  v_defender uuid[];
  v_bonus_exp integer;
  v_bonus_activity integer;
  v_uid uuid := auth.uid();
  v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT created_by
  INTO v_creator
  FROM public.activities
  WHERE id = p_activity_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION '活动不存在';
  END IF;
  IF v_creator <> v_uid
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = v_uid AND role = 'admin'
    )
  THEN
    RAISE EXCEPTION '无权限';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id AND settled = true
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id AND cancelled = true
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.growth_config
  WHERE id = 1;

  SELECT array_agg(user_id)
  INTO v_mvp
  FROM (
    SELECT
      ms.user_id,
      COALESCE(ms.goals, 0) + COALESCE(ms.assists, 0) AS total
    FROM public.match_stats ms
    WHERE ms.activity_id = p_activity_id
    ORDER BY total DESC, ms.created_at ASC
  ) sub
  WHERE total = (
      SELECT max(COALESCE(goals, 0) + COALESCE(assists, 0))
      FROM public.match_stats
      WHERE activity_id = p_activity_id
    )
    AND total > 0;

  SELECT array_agg(candidate_id)
  INTO v_defender
  FROM (
    SELECT candidate_id, count(*) AS cnt
    FROM public.match_votes
    WHERE activity_id = p_activity_id AND kind = 'defender'
    GROUP BY candidate_id
    ORDER BY cnt DESC, min(created_at) ASC
  ) sub
  WHERE cnt = (
    SELECT max(cnt)
    FROM (
      SELECT count(*) AS cnt
      FROM public.match_votes
      WHERE activity_id = p_activity_id AND kind = 'defender'
      GROUP BY candidate_id
    ) defender_counts
  );

  FOR r IN
    SELECT
      p.id,
      p.exp,
      COALESCE(ms.goals, 0) AS goals,
      COALESCE(ms.assists, 0) AS assists
    FROM public.profiles p
    LEFT JOIN public.match_stats ms
      ON ms.user_id = p.id
      AND ms.activity_id = p_activity_id
    WHERE p.id IN (
      SELECT user_id
      FROM public.registrations
      WHERE activity_id = p_activity_id
        AND status = 'confirmed'
    )
  LOOP
    v_bonus_exp := 0;
    v_bonus_activity := 0;

    IF r.id = ANY (v_mvp) THEN
      v_bonus_exp := v_bonus_exp + v_cfg.mvp_exp;
      v_bonus_activity := v_bonus_activity + v_cfg.mvp_activity;
    END IF;
    IF r.id = ANY (v_defender) THEN
      v_bonus_exp := v_bonus_exp + v_cfg.defender_exp;
      v_bonus_activity := v_bonus_activity + v_cfg.defender_activity;
    END IF;

    v_bonus_exp := v_bonus_exp
      + r.goals * v_cfg.goal_exp
      + r.assists * v_cfg.assist_exp;
    v_bonus_activity := v_bonus_activity
      + r.goals * v_cfg.goal_activity
      + r.assists * v_cfg.assist_activity;

    v_old_exp := r.exp;
    v_new_exp := r.exp + v_cfg.exp_per_match + v_bonus_exp;
    v_old_level := public.growth_level_for_exp(
      v_old_exp::bigint,
      v_cfg.exp_per_level
    );
    v_new_level := public.growth_level_for_exp(
      v_new_exp::bigint,
      v_cfg.exp_per_level
    );

    UPDATE public.profiles
    SET activity = activity + v_cfg.activity_per_match + v_bonus_activity,
        exp = v_new_exp,
        free_points = free_points
          + GREATEST(v_new_level - v_old_level, 0) * 5,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  UPDATE public.activities
  SET settled = true
  WHERE id = p_activity_id;
END
$function$;

-- Reassert the 00110 boundary after replacing its payload implementation.
REVOKE ALL ON FUNCTION public.ability_allocation_payload(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ability_allocation(uuid, jsonb, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
