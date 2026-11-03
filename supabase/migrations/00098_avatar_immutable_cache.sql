-- 头像对象采用版本化文件名；更新头像会生成新 URL，因此旧 URL 可永久缓存。
UPDATE storage.objects
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{cacheControl}',
  '"max-age=31536000, immutable"'::jsonb
)
WHERE bucket_id = 'avatars'
  AND COALESCE(metadata->>'cacheControl', '') <> 'max-age=31536000, immutable';
