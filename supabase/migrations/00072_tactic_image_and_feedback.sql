-- 战术支持上传图片附件
ALTER TABLE public.tactics ADD COLUMN image_url text;

-- 队员对战术的反馈（文字 + 图片）
CREATE TABLE public.tactic_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tactic_id uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  content text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tactic_feedback_tactic ON public.tactic_feedback(tactic_id, created_at DESC);
ALTER TABLE public.tactic_feedback ENABLE ROW LEVEL SECURITY;

-- SELECT：本人反馈 / 战术下发者(队长) / 战术接收者(队员) / 管理员
CREATE POLICY "tactic_feedback_select_auth" ON public.tactic_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tactics t WHERE t.id = tactic_feedback.tactic_id AND (t.author_id = auth.uid() OR t.target_user_id = auth.uid()))
  );
CREATE POLICY "tactic_feedback_select_admin" ON public.tactic_feedback
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- INSERT：仅战术接收者本人可提交反馈
CREATE POLICY "tactic_feedback_insert_auth" ON public.tactic_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tactics t WHERE t.id = tactic_id AND t.target_user_id = auth.uid())
  );

-- UPDATE / DELETE：管理员可操作
CREATE POLICY "tactic_feedback_update_admin" ON public.tactic_feedback
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "tactic_feedback_delete_admin" ON public.tactic_feedback
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 战术图片存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tactic_images', 'tactic_images', true, 1048576, ARRAY['image/jpeg','image/png','image/gif','image/webp','image/avif']);

CREATE POLICY "tactic_images_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'tactic_images');
CREATE POLICY "tactic_images_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tactic_images');
CREATE POLICY "tactic_images_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'tactic_images');
CREATE POLICY "tactic_images_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'tactic_images');