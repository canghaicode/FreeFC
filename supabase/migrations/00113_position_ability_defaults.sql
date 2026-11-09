BEGIN;

-- Positional defaults are initialization, not a selectable client-side template.
CREATE OR REPLACE FUNCTION public.position_ability_base(p_position text)
RETURNS TABLE(ab_pace integer, ab_shooting integer, ab_passing integer,
              ab_dribbling integer, ab_defending integer, ab_stamina integer)
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT v[1], v[2], v[3], v[4], v[5], v[6]
  FROM (SELECT CASE upper(btrim(COALESCE(p_position, '')))
    WHEN '门将' THEN ARRAY[40,40,60,40,70,50]
    WHEN 'GK' THEN ARRAY[40,40,60,40,70,50]
    WHEN '后卫' THEN ARRAY[50,40,45,40,65,60]
    WHEN 'CB' THEN ARRAY[50,40,45,40,65,60]
    WHEN '中场' THEN ARRAY[45,45,65,55,40,50]
    WHEN 'CM' THEN ARRAY[45,45,65,55,40,50]
    WHEN '前锋' THEN ARRAY[60,65,40,55,40,40]
    WHEN 'ST' THEN ARRAY[60,65,40,55,40,40]
    ELSE ARRAY[50,50,50,50,50,50]
  END AS v) defaults;
$$;
REVOKE ALL ON FUNCTION public.position_ability_base(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.initialize_ability_allocation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_base record;
BEGIN
  SELECT * INTO v_base FROM public.position_ability_base(NEW.preferred_position);
  INSERT INTO public.ability_bases
    (user_id, ab_pace, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_stamina)
  VALUES (NEW.id, v_base.ab_pace, v_base.ab_shooting, v_base.ab_passing,
          v_base.ab_dribbling, v_base.ab_defending, v_base.ab_stamina)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.ability_allocations (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.profiles p SET
    ab_pace = b.ab_pace + a.ab_pace,
    ab_shooting = b.ab_shooting + a.ab_shooting,
    ab_passing = b.ab_passing + a.ab_passing,
    ab_dribbling = b.ab_dribbling + a.ab_dribbling,
    ab_defending = b.ab_defending + a.ab_defending,
    ab_stamina = b.ab_stamina + a.ab_stamina
  FROM public.ability_bases b, public.ability_allocations a
  WHERE p.id = NEW.id AND b.user_id = p.id AND a.user_id = p.id;
  RETURN NEW;
END;
$$;

-- Signup usually precedes selecting a position. Initialize on that first choice
-- only while the member still has an untouched balanced base and no investment.
CREATE OR REPLACE FUNCTION public.initialize_base_on_first_position()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NULLIF(btrim(OLD.preferred_position), '') IS NOT NULL
     OR NULLIF(btrim(NEW.preferred_position), '') IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.ability_bases b SET
    ab_pace = v.ab_pace, ab_shooting = v.ab_shooting, ab_passing = v.ab_passing,
    ab_dribbling = v.ab_dribbling, ab_defending = v.ab_defending, ab_stamina = v.ab_stamina,
    updated_at = now()
  FROM public.position_ability_base(NEW.preferred_position) v, public.ability_allocations a
  WHERE b.user_id = NEW.id AND a.user_id = b.user_id
    AND b.ab_pace = 50 AND b.ab_shooting = 50 AND b.ab_passing = 50
    AND b.ab_dribbling = 50 AND b.ab_defending = 50 AND b.ab_stamina = 50
    AND b.updated_at = b.created_at
    AND a.ab_pace + a.ab_shooting + a.ab_passing + a.ab_dribbling + a.ab_defending + a.ab_stamina = 0;
  IF FOUND THEN
    UPDATE public.profiles p SET
      ab_pace = b.ab_pace, ab_shooting = b.ab_shooting, ab_passing = b.ab_passing,
      ab_dribbling = b.ab_dribbling, ab_defending = b.ab_defending, ab_stamina = b.ab_stamina
    FROM public.ability_bases b WHERE p.id = NEW.id AND b.user_id = p.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_base_on_first_position() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS zz_initialize_base_on_first_position ON public.profiles;
CREATE TRIGGER zz_initialize_base_on_first_position
  AFTER UPDATE OF preferred_position ON public.profiles
  FOR EACH ROW WHEN (OLD.preferred_position IS DISTINCT FROM NEW.preferred_position)
  EXECUTE FUNCTION public.initialize_base_on_first_position();

CREATE TABLE IF NOT EXISTS public.ability_position_migration_00113_snapshot (
  user_id uuid PRIMARY KEY,
  old_profile jsonb NOT NULL,
  old_base jsonb NOT NULL,
  old_allocation jsonb NOT NULL,
  new_base jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ability_position_migration_00113_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ability_position_migration_00113_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_position_migration_00113_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ability_position_migration_00113_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_position_migration_00113_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ability_position_migration_00113_snapshot, public.ability_position_migration_00113_state
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ability_position_migration_00113_snapshot, public.ability_position_migration_00113_state TO service_role;

DO $$
BEGIN
  LOCK TABLE public.profiles IN EXCLUSIVE MODE;
  LOCK TABLE public.ability_bases IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.ability_allocations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.ability_position_migration_00113_state) THEN RETURN; END IF;

  INSERT INTO public.ability_position_migration_00113_snapshot
    (user_id, old_profile, old_base, old_allocation, new_base)
  SELECT p.id, to_jsonb(p), to_jsonb(b), to_jsonb(a), to_jsonb(v)
  FROM public.profiles p
  JOIN public.ability_bases b ON b.user_id = p.id
  JOIN public.ability_allocations a ON a.user_id = p.id
  CROSS JOIN LATERAL public.position_ability_base(p.preferred_position) v
  WHERE b.ab_pace = 50 AND b.ab_shooting = 50 AND b.ab_passing = 50
    AND b.ab_dribbling = 50 AND b.ab_defending = 50 AND b.ab_stamina = 50
    AND b.updated_at = b.created_at
    AND a.ab_pace + a.ab_shooting + a.ab_passing + a.ab_dribbling + a.ab_defending + a.ab_stamina = 0
    AND to_jsonb(v) <> '{"ab_pace":50,"ab_shooting":50,"ab_passing":50,"ab_dribbling":50,"ab_defending":50,"ab_stamina":50}'::jsonb;

  UPDATE public.ability_bases b SET
    ab_pace = (s.new_base->>'ab_pace')::integer,
    ab_shooting = (s.new_base->>'ab_shooting')::integer,
    ab_passing = (s.new_base->>'ab_passing')::integer,
    ab_dribbling = (s.new_base->>'ab_dribbling')::integer,
    ab_defending = (s.new_base->>'ab_defending')::integer,
    ab_stamina = (s.new_base->>'ab_stamina')::integer,
    updated_at = now()
  FROM public.ability_position_migration_00113_snapshot s WHERE s.user_id = b.user_id;
  UPDATE public.profiles p SET
    ab_pace = b.ab_pace, ab_shooting = b.ab_shooting, ab_passing = b.ab_passing,
    ab_dribbling = b.ab_dribbling, ab_defending = b.ab_defending, ab_stamina = b.ab_stamina
  FROM public.ability_bases b, public.ability_position_migration_00113_snapshot s
  WHERE p.id = s.user_id AND b.user_id = p.id;
  INSERT INTO public.ability_position_migration_00113_state (singleton) VALUES (true);
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
