DO $$
DECLARE r record; uid uuid; aid uuid;
BEGIN
  SELECT r2.user_id, r2.activity_id INTO uid, aid FROM registrations r2 LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO match_stats (activity_id, user_id, goals, assists) VALUES (aid, uid, 1, 0);
    RAISE NOTICE 'PASS: registered user insert ok';
  ELSE
    RAISE NOTICE 'SKIP: no registrations';
  END IF;
END $$;