-- 活动报名名单一次返回队员资料、历史总出场数与嘉宾；不再传输六项能力值。

CREATE OR REPLACE FUNCTION public.get_activity_registrations_with_profiles(p_activity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(r)
      || jsonb_build_object(
        'profiles', jsonb_build_object(
          'id', p.id,
          'nickname', p.nickname,
          'avatar_url', p.avatar_url,
          'jersey_number', p.jersey_number,
          'preferred_position', p.preferred_position,
          'secondary_position', p.secondary_position,
          'title', p.title,
          'appearances', COALESCE(mg.appearances, 0)
        ),
        'guests', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', g.id,
              'registration_id', g.registration_id,
              'activity_id', g.activity_id,
              'seq', g.seq,
              'name', g.name,
              'position', g.position,
              'team', g.team,
              'created_at', g.created_at
            )
            ORDER BY g.seq, g.created_at, g.id
          )
          FROM public.registration_guests g
          WHERE g.registration_id = r.id
        ), '[]'::jsonb)
      )
      ORDER BY r.created_at, r.id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT registration.*
    FROM public.registrations registration
    WHERE registration.activity_id = p_activity_id
    ORDER BY registration.created_at, registration.id
    LIMIT 60
  ) r
  JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN public.member_growth mg ON mg.id = r.user_id;
$function$;

REVOKE ALL ON FUNCTION public.get_activity_registrations_with_profiles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_registrations_with_profiles(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
