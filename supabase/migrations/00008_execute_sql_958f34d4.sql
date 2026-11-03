CREATE OR REPLACE FUNCTION pg_temp.test_report_guard() RETURNS text LANGUAGE plpgsql AS $$
DECLARE uid uuid; aid uuid;
BEGIN
  -- 找一个对该活动未报名的用户
  SELECT p.id INTO uid FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.user_id = p.id)
  LIMIT 1;
  SELECT a.id INTO aid FROM activities a LIMIT 1;
  IF uid IS NULL OR aid IS NULL THEN RETURN 'SKIP: no data'; END IF;
  BEGIN
    INSERT INTO match_stats (activity_id, user_id, goals, assists) VALUES (aid, uid, 0, 0);
    RETURN 'FAIL: unregistered insert was allowed';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'PASS: blocked with message: ' || SQLERRM;
  END;
END $$;