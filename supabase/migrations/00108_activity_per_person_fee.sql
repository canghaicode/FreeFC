-- 每场活动保存最近一次导出收款海报时计算的人均费用。

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS per_person_fee numeric(10, 2);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_per_person_fee_nonnegative'
      AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_per_person_fee_nonnegative
      CHECK (per_person_fee IS NULL OR per_person_fee >= 0);
  END IF;
END
$migration$;

COMMENT ON COLUMN public.activities.per_person_fee IS '最近一次导出收款海报时计算的人均费用（元）';

NOTIFY pgrst, 'reload schema';
