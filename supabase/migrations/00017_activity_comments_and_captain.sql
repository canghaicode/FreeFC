-- ============ 活动评论区 ============
CREATE TABLE public.activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_comments_activity ON public.activity_comments(activity_id, created_at DESC);

ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read comments" ON public.activity_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users insert own comments" ON public.activity_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own comments" ON public.activity_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "admins delete any comments" ON public.activity_comments
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============ 永久队长保护（seven）============
-- seven 当前已是 admin；此触发器确保任何路径（含 set_member_role RPC）都无法将其降级
CREATE OR REPLACE FUNCTION public.protect_captain_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
BEGIN
  IF OLD.id = '3dca509b-4ab0-4b83-ad48-f7865eb8c319'::uuid
     AND OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'seven 是本队永久队长，不可降级';
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_protect_captain
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_captain_role();

-- 确保 seven 当前为队长
UPDATE public.profiles SET role = 'admin', updated_at = now()
  WHERE id = '3dca509b-4ab0-4b83-ad48-f7865eb8c319' AND role IS DISTINCT FROM 'admin';