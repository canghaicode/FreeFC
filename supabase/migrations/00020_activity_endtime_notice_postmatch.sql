-- ============ activities：起止时间 + 免责约定 ============
ALTER TABLE public.activities
  ADD COLUMN end_time timestamptz,
  ADD COLUMN notice text;

-- ============ tactics.team 改为可自定义文本（去掉写死枚举）============
ALTER TABLE public.tactics DROP CONSTRAINT IF EXISTS tactics_team_check;
ALTER TABLE public.tactics ALTER COLUMN team TYPE text USING team::text;
ALTER TABLE public.tactics ALTER COLUMN team SET DEFAULT '红队';

-- ============ 赛后总结（一场一个）============
CREATE TABLE public.match_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.match_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read summaries" ON public.match_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write summaries" ON public.match_summaries
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "admin update summaries" ON public.match_summaries
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============ 赛后投票（MVP / 最佳防守，单场单候选人单类型）============
CREATE TABLE public.match_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mvp','defender')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, voter_id, kind),
  CHECK (candidate_id <> voter_id)
);
CREATE INDEX idx_match_votes_activity ON public.match_votes(activity_id, kind);
ALTER TABLE public.match_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read match_votes" ON public.match_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "voters insert match_votes" ON public.match_votes
  FOR INSERT TO authenticated WITH CHECK (voter_id = auth.uid() AND candidate_id <> auth.uid());