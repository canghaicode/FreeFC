-- 存量照片已在服务器完成回迁后，删除全部 PicUI 遗留结构。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_photos WHERE storage_path IS NULL) THEN
    RAISE EXCEPTION '仍有群相册照片未迁移到 Supabase Storage';
  END IF;
END
$$;

ALTER TABLE public.team_photos
  ALTER COLUMN storage_path SET NOT NULL,
  DROP COLUMN IF EXISTS picui_key;

DROP TABLE IF EXISTS public.picui_config;

COMMENT ON TABLE public.team_photos IS '群相册照片元数据（文件存 Supabase Storage）';

NOTIFY pgrst, 'reload schema';
