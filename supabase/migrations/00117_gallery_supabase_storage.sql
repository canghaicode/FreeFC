-- 群相册切换到 Supabase Storage；存量图片由服务器一次性迁移脚本回迁。
ALTER TABLE public.team_photos
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 迁移窗口内允许新记录不再生成 picui_key；00118 完成清理。
ALTER TABLE public.team_photos
  ALTER COLUMN picui_key DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_photos_storage_path_uidx
  ON public.team_photos(storage_path)
  WHERE storage_path IS NOT NULL;

COMMENT ON TABLE public.team_photos IS '群相册照片元数据（文件存 Supabase Storage）';
COMMENT ON COLUMN public.team_photos.storage_path IS 'team-photos 存储桶内对象路径';
COMMENT ON COLUMN public.team_photos.picui_key IS '旧图床迁移字段；回迁完成后为空';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-photos',
  'team-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "team_photos_public_read" ON storage.objects;
CREATE POLICY "team_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'team-photos');

NOTIFY pgrst, 'reload schema';
