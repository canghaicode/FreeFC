-- 战术板球员棋子持久化：教练放置的球员位置随战术一并保存
ALTER TABLE public.tactics
  ADD COLUMN IF NOT EXISTS players jsonb NOT NULL DEFAULT '[]'::jsonb;