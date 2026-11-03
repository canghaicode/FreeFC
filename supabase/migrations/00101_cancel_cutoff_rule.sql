-- 活动取消报名截止规则：
-- cancel_cutoff_mode: 'hours' = 开赛前 N 小时内不可取消；'sameday' = 活动当天 N 点后至活动开始不可取消
-- cancel_cutoff_value: 小时数（hours 模式，1-72）或当天钟点（sameday 模式，0-23）
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS cancel_cutoff_mode text NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS cancel_cutoff_value integer NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_cancel_cutoff_mode_check'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_cancel_cutoff_mode_check
      CHECK (cancel_cutoff_mode IN ('hours', 'sameday'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_cancel_cutoff_value_check'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_cancel_cutoff_value_check
      CHECK (cancel_cutoff_value >= 0 AND cancel_cutoff_value <= 72);
  END IF;
END $$;
