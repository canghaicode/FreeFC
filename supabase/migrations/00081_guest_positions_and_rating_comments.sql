-- 1. 嘉宾表：随报名人存储，含姓名/位置/分队
CREATE TABLE public.registration_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 1,
  name text,
  position text,
  team text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reg_guests_activity ON public.registration_guests(activity_id);

ALTER TABLE public.registration_guests ENABLE ROW LEVEL SECURITY;

-- 报名名单公开可读
CREATE POLICY "reg_guests_select_anon" ON public.registration_guests FOR SELECT TO anon USING (true);
CREATE POLICY "reg_guests_select_auth" ON public.registration_guests FOR SELECT TO authenticated USING (true);

-- 报名人可为自己的报名添加嘉宾（常规路径走 RPC，此处兜底）
CREATE POLICY "reg_guests_insert_auth" ON public.registration_guests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid()));

-- 更新/删除：管理员或该报名本人
CREATE POLICY "reg_guests_update_auth" ON public.registration_guests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::user_role));

CREATE POLICY "reg_guests_delete_auth" ON public.registration_guests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::user_role));

-- 2. 评分表增加评论与标签
ALTER TABLE public.player_ratings ADD COLUMN comment text;
ALTER TABLE public.player_ratings ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

-- 3. 历史报名的隐含嘉宾（guest_count>0）补生成嘉宾行，使其参与分队
INSERT INTO public.registration_guests (registration_id, activity_id, seq, name, position)
SELECT r.id, r.activity_id, gs, NULL, NULL
FROM public.registrations r
JOIN generate_series(1, r.guest_count) AS gs ON true
WHERE r.guest_count > 0 AND r.status = 'confirmed'
  AND NOT EXISTS (SELECT 1 FROM public.registration_guests g WHERE g.registration_id = r.id);