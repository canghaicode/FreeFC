BEGIN;

-- All match-stat writes use database time and activity state as the authority.
-- The existing trigger already invokes this function before INSERT or UPDATE.
CREATE OR REPLACE FUNCTION public.check_report_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_end_at timestamptz;
BEGIN
  SELECT a.*
  INTO v_activity
  FROM public.activities a
  WHERE a.id = NEW.activity_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '活动不存在';
  END IF;

  IF v_activity.cancelled THEN
    RAISE EXCEPTION '活动已取消，无法填报数据';
  END IF;

  IF v_activity.settled THEN
    RAISE EXCEPTION '活动已结算，无法修改数据';
  END IF;

  v_end_at := COALESCE(v_activity.end_time, v_activity.activity_time);
  IF now() >= v_end_at + interval '12 hours' THEN
    RAISE EXCEPTION '数据填报已截止，系统已结算不可修改';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.activity_id = NEW.activity_id
      AND r.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION '未报名本场活动，无法填报数据';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_report_registration()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
