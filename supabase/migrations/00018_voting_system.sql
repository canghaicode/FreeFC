-- ============ 队内事务投票 ============
CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 60),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) > 0 AND length(label) <= 60),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_poll_options_poll ON public.poll_options(poll_id, sort_order);
CREATE INDEX idx_poll_votes_poll ON public.poll_votes(poll_id);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read polls" ON public.polls
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create polls" ON public.polls
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner update polls" ON public.polls
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());
CREATE POLICY "owner delete polls" ON public.polls
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin());

ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read options" ON public.poll_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner create options" ON public.poll_options
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.polls p
            WHERE p.id = poll_id AND (p.created_by = auth.uid() OR public.is_admin()))
  );
CREATE POLICY "owner delete options" ON public.poll_options
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.polls p
            WHERE p.id = poll_id AND (p.created_by = auth.uid() OR public.is_admin()))
  );

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read votes" ON public.poll_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own vote" ON public.poll_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users change own vote" ON public.poll_votes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own vote" ON public.poll_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ 最佳防守球员投票 ============
CREATE TABLE public.defender_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points int NOT NULL CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, voter_id, candidate_id),
  CHECK (voter_id <> candidate_id)
);

CREATE INDEX idx_defender_votes_rank ON public.defender_votes(season_id, candidate_id);

ALTER TABLE public.defender_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read defender votes" ON public.defender_votes
  FOR SELECT TO authenticated USING (true);

-- 原子投票：校验点数余额（出场次数=报名场次）后累加，防超投
CREATE OR REPLACE FUNCTION public.cast_defender_vote(p_season_id uuid, p_candidate_id uuid, p_points int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_voter uuid := auth.uid();
  v_appearances int;
  v_used int;
BEGIN
  IF v_voter IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION '点数需为正整数';
  END IF;
  IF p_candidate_id = v_voter THEN
    RAISE EXCEPTION '不能投给自己';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_candidate_id) THEN
    RAISE EXCEPTION '队员不存在';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION '赛季不存在';
  END IF;

  SELECT count(*)::int INTO v_appearances
  FROM public.registrations r
  JOIN public.activities a ON a.id = r.activity_id
  WHERE r.user_id = v_voter AND a.season_id = p_season_id;

  SELECT COALESCE(sum(points), 0)::int INTO v_used
  FROM public.defender_votes
  WHERE voter_id = v_voter AND season_id = p_season_id;

  IF v_appearances - v_used < p_points THEN
    RAISE EXCEPTION '可用点数不足（剩余%点）', v_appearances - v_used;
  END IF;

  INSERT INTO public.defender_votes (season_id, voter_id, candidate_id, points)
  VALUES (p_season_id, v_voter, p_candidate_id, p_points)
  ON CONFLICT (season_id, voter_id, candidate_id)
  DO UPDATE SET points = public.defender_votes.points + excluded.points,
                updated_at = now();

  RETURN v_appearances - v_used - p_points;
END $function$;

-- ============ 小程序码存储桶（公开读）============
INSERT INTO storage.buckets (id, name, public) VALUES ('minicode', 'minicode', true);

CREATE POLICY "public read minicode" ON storage.objects
  FOR SELECT USING (bucket_id = 'minicode');