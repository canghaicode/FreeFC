-- 自定义收款码上传权限：管理员可上传到 minicode bucket（公开读已有策略）
CREATE POLICY "minicode admin upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'minicode' AND public.is_admin()
  );