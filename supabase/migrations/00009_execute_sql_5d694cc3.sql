DO $$
DECLARE aid uuid; uid uuid;
BEGIN
  SELECT id INTO uid FROM profiles LIMIT 1;
  INSERT INTO activities (season_id, title, activity_time, location, max_players, created_by)
  SELECT s.id, '【测试】级联删除验证', now() + interval '1 day', '测试场地', 11, uid
  FROM seasons s WHERE s.is_active LIMIT 1
  RETURNING id INTO aid;
  IF aid IS NULL THEN RAISE NOTICE 'SKIP: no active season'; RETURN; END IF;
  INSERT INTO registrations (activity_id, user_id) VALUES (aid, uid);
  INSERT INTO lineups (activity_id, formation, positions) VALUES (aid, '4-4-2', '[]'::jsonb);
  DELETE FROM activities WHERE id = aid;
  IF NOT EXISTS (SELECT 1 FROM registrations WHERE activity_id = aid)
     AND NOT EXISTS (SELECT 1 FROM lineups WHERE activity_id = aid) THEN
    RAISE NOTICE 'PASS: cascade delete cleared registrations & lineups';
  ELSE
    RAISE NOTICE 'FAIL: orphan rows remain';
  END IF;
END $$;