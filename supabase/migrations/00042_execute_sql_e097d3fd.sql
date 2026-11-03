DO $$
DECLARE v_act uuid;
BEGIN
  INSERT INTO public.activities (season_id, title, activity_time, end_time, location, match_type, max_players, coach_slots, captain_slots, team_groups, created_by)
  VALUES ((SELECT id FROM public.seasons WHERE is_active LIMIT 1), '候补测试活动', now()+interval '5 day', now()+interval '6 day', '测试场', 'internal', 2, 1, 1, 2, '358f4665-6c8f-445f-9403-c705b00cfddb')
  RETURNING id INTO v_act;
  -- 直接插入2个正选 + 2个候补（绕过RPC，模拟满员后的候补）
  INSERT INTO public.registrations (activity_id, user_id, seat_role, status, waitlist_seq)
  VALUES
    (v_act, '479a3df2-716d-4318-a9ba-ec6371141b8c', 'player', 'confirmed', 0),
    (v_act, '8c69dc12-f1ae-4598-bfbc-6b47c722b575', 'player', 'confirmed', 0),
    (v_act, '3836dd31-5c5b-4bca-bc8c-90d20e20c7d0', 'player', 'waitlist', 1),
    (v_act, 'a39abcae-a645-47a3-b839-867deba1d4f2', 'player', 'waitlist', 2);
END $$;