-- 相册对象路径使用 UUID 且不会覆盖，允许客户端长期缓存不可变图片。
UPDATE storage.objects
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{cacheControl}',
  to_jsonb('public, max-age=31536000, immutable'::text),
  true
)
WHERE bucket_id = 'team-photos'
  AND metadata ->> 'cacheControl' IS DISTINCT FROM 'public, max-age=31536000, immutable';
