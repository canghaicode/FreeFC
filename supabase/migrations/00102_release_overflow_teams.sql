-- 减少内战分组数时，把超出当前分组的队员和嘉宾改为未分队。
-- A/B/C/D 分别对应第 1/2/3/4 组，只清空序号大于 team_groups 的分队。
CREATE OR REPLACE FUNCTION public.release_overflow_activity_teams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_groups integer;
  v_allowed text[];
BEGIN
  IF NEW.match_type IS DISTINCT FROM 'internal' THEN
    RETURN NEW;
  END IF;

  v_groups := GREATEST(2, LEAST(4, COALESCE(NEW.team_groups, 2)));
  v_allowed := (ARRAY['A', 'B', 'C', 'D'])[1:v_groups];

  UPDATE public.registrations
  SET team = NULL
  WHERE activity_id = NEW.id
    AND team IS NOT NULL
    AND btrim(team) <> ALL (v_allowed);

  UPDATE public.registration_guests
  SET team = NULL
  WHERE activity_id = NEW.id
    AND team IS NOT NULL
    AND btrim(team) <> ALL (v_allowed);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_overflow_activity_teams ON public.activities;
CREATE TRIGGER trg_release_overflow_activity_teams
AFTER UPDATE OF team_groups, match_type ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.release_overflow_activity_teams();

-- 修正已经减少分组、但分队值仍停在被移除队伍上的历史数据。
UPDATE public.registrations r
SET team = NULL
FROM public.activities a
WHERE r.activity_id = a.id
  AND a.match_type = 'internal'
  AND r.team IS NOT NULL
  AND btrim(r.team) <> ALL (
    (ARRAY['A', 'B', 'C', 'D'])[1:GREATEST(2, LEAST(4, COALESCE(a.team_groups, 2)))]
  );

UPDATE public.registration_guests g
SET team = NULL
FROM public.activities a
WHERE g.activity_id = a.id
  AND a.match_type = 'internal'
  AND g.team IS NOT NULL
  AND btrim(g.team) <> ALL (
    (ARRAY['A', 'B', 'C', 'D'])[1:GREATEST(2, LEAST(4, COALESCE(a.team_groups, 2)))]
  );
