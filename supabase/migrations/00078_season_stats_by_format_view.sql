CREATE OR REPLACE VIEW public.season_stats_by_format AS
SELECT a.season_id,
    a.match_format,
    r.user_id,
    p.nickname,
    p.avatar_url,
    p.jersey_number,
    p.preferred_position AS "position",
    count(r.id)::integer AS appearances,
    COALESCE(sum(ms.goals), 0::bigint)::integer AS goals,
    COALESCE(sum(ms.assists), 0::bigint)::integer AS assists
FROM registrations r
  JOIN activities a ON a.id = r.activity_id AND a.cancelled = false AND a.activity_time <= now()
  JOIN profiles p ON p.id = r.user_id
  LEFT JOIN match_stats ms ON ms.activity_id = r.activity_id AND ms.user_id = r.user_id
GROUP BY a.season_id, a.match_format, r.user_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;