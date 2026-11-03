-- 球员综合评分表：rater 给 rated 打分（1.0-10.0，一位小数），同对覆盖
CREATE TABLE public.player_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score numeric(3,1) NOT NULL CHECK (score >= 1.0 AND score <= 10.0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rater_id, rated_id)
);

CREATE INDEX idx_player_ratings_rated ON public.player_ratings(rated_id);

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

-- 全员可读（球队内部评分公开）
CREATE POLICY "player_ratings_select_anon" ON public.player_ratings FOR SELECT TO anon USING (true);
CREATE POLICY "player_ratings_select_auth" ON public.player_ratings FOR SELECT TO authenticated USING (true);

-- 登录用户可给自己或他人评分（rater_id 自动填充）
CREATE POLICY "player_ratings_insert_auth" ON public.player_ratings FOR INSERT TO authenticated WITH CHECK (rater_id = auth.uid());
CREATE POLICY "player_ratings_update_auth" ON public.player_ratings FOR UPDATE TO authenticated USING (rater_id = auth.uid()) WITH CHECK (rater_id = auth.uid());
CREATE POLICY "player_ratings_delete_auth" ON public.player_ratings FOR DELETE TO authenticated USING (rater_id = auth.uid());

-- 管理员全权限
CREATE POLICY "player_ratings_admin_all" ON public.player_ratings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::user_role));

-- 球员平均评分视图（含评分数；无评分时评分数为 0）
CREATE VIEW public.player_avg_ratings AS
SELECT rated_id AS user_id,
  ROUND(AVG(score)::numeric, 1) AS avg_rating,
  count(*)::integer AS rating_count
FROM public.player_ratings
GROUP BY rated_id;

GRANT SELECT ON public.player_avg_ratings TO anon, authenticated;

-- MVP 榜视图：按赛季/赛制聚合 match_votes(kind='mvp') 得票数
CREATE VIEW public.mvp_ranking AS
SELECT a.season_id,
  a.match_format,
  v.candidate_id AS user_id,
  p.nickname,
  p.avatar_url,
  p.jersey_number,
  p.preferred_position AS "position",
  count(v.id)::integer AS mvp_votes
FROM match_votes v
  JOIN activities a ON a.id = v.activity_id AND a.cancelled = false AND a.activity_time <= now()
  JOIN profiles p ON p.id = v.candidate_id
WHERE v.kind = 'mvp'
GROUP BY a.season_id, a.match_format, v.candidate_id, p.nickname, p.avatar_url, p.jersey_number, p.preferred_position;

GRANT SELECT ON public.mvp_ranking TO anon, authenticated;