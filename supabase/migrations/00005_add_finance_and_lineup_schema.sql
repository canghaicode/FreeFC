-- ============ 队费记账 + 首发阵型 ============

-- 队费收支记录表
CREATE TABLE public.finance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('income', 'expense')),
  category text NOT NULL DEFAULT 'other',
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  note text,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_records_date ON public.finance_records (record_date DESC);

-- 首发阵型表（每活动一份）
CREATE TABLE public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
  formation text NOT NULL DEFAULT '4-3-3',
  positions jsonb NOT NULL DEFAULT '[]',
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE public.finance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view finance records" ON public.finance_records
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage finance records" ON public.finance_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view lineups" ON public.lineups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage lineups" ON public.lineups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());