-- 修复「队员确认收到战术」报错：
-- 原策略 USING (target_user_id = uid() AND confirmed = false) 无 WITH CHECK，
-- Postgres 默认将 USING 作为 WITH CHECK，导致更新 confirmed=true 时新行违反策略，
-- 客户端收到 42501 new row violates row-level security policy。
-- 修复：显式 WITH CHECK 仅校验目标队员身份，允许将 confirmed 置为 true。
DROP POLICY "target confirm tactics" ON public.tactics;

CREATE POLICY "target confirm tactics" ON public.tactics
  FOR UPDATE TO authenticated
  USING ((target_user_id = auth.uid()) AND (confirmed = false))
  WITH CHECK ((target_user_id = auth.uid()));