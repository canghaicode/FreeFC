ALTER TABLE public.profiles
  ADD COLUMN preferred_foot text NOT NULL DEFAULT 'right' CHECK (preferred_foot IN ('left','right','both')),
  ADD COLUMN foot_skill integer NOT NULL DEFAULT 5 CHECK (foot_skill BETWEEN 1 AND 10),
  ADD COLUMN weak_foot_skill integer NOT NULL DEFAULT 5 CHECK (weak_foot_skill BETWEEN 1 AND 10),
  ADD COLUMN traits jsonb NOT NULL DEFAULT '[]'::jsonb;