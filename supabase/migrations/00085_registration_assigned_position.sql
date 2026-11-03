-- v115: 分队管理支持手动指定队员场上位置（按活动级别）
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS assigned_position text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registrations_assigned_position_check'
  ) THEN
    ALTER TABLE registrations ADD CONSTRAINT registrations_assigned_position_check
      CHECK (assigned_position IN ('前锋', '中场', '后卫', '门将') OR assigned_position IS NULL);
  END IF;
END $$;