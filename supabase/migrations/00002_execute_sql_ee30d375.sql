CREATE OR REPLACE VIEW public.season_stats WITH (security_invoker = 'true') AS SELECT
  a.season_id AS season_id,
  r.user_id AS user_id,
  p.nickname AS nickname,
  p.avatar_url AS avatar_url,
  p.jersey_number AS jersey_number,
  p."position" AS "position",
  (count(r.id))::int AS appearances,
  CAST(COALESCE(sum(ms.goals), 0) AS int) AS goals,
  CAST(COALESCE(sum(ms.assists), 0) AS int) AS assists
FROM public.registrations AS r
JOIN public.activities AS a ON a.id = r.activity_id
JOIN public.profiles AS p ON p.id = r.user_id
LEFT JOIN public.match_stats AS ms ON
  ms.activity_id = r.activity_id
    AND ms.user_id = r.user_id
GROUP BY
  a.season_id,
  r.user_id,
  p.nickname,
  p.avatar_url,
  p.jersey_number,
  p."position";