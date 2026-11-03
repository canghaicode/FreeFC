-- 为 activities 表新增 match_format 字段，支持 '5'（5人制）、'8'（8人制）、'11'（11人制），默认 '11'
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT '11';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_match_format_check'
  ) THEN
    ALTER TABLE public.activities 
    ADD CONSTRAINT activities_match_format_check 
    CHECK (match_format IN ('5', '8', '11'));
  END IF;
END $$;
