-- 战术模板：支持教练收藏当前绘制，下次一键导入
CREATE TABLE IF NOT EXISTS public.tactic_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '未命名模板',
  team text NOT NULL DEFAULT '红队',
  view_mode text NOT NULL DEFAULT 'half' CHECK (view_mode IN ('half', 'full')),
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tactic_templates_owner ON public.tactic_templates(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tactic_templates_public ON public.tactic_templates(is_public, created_at DESC);

ALTER TABLE public.tactic_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read tactic_templates" ON public.tactic_templates
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_public = true);

CREATE POLICY "owner update tactic_templates" ON public.tactic_templates
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated create tactic_templates" ON public.tactic_templates
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner delete tactic_templates" ON public.tactic_templates
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());