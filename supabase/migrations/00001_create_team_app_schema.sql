-- ============ 球队管家：数据库结构 ============

-- 用户角色枚举
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 队员资料表（auth.users 同步 + 球队字段）
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  email text,
  phone text,
  role public.user_role NOT NULL DEFAULT 'user',
  openid text,
  nickname text,
  avatar_url text,
  jersey_number int CHECK (jersey_number IS NULL OR (jersey_number >= 0 AND jersey_number <= 999)),
  position text,
  ability int DEFAULT 60 CHECK (ability IS NULL OR (ability >= 1 AND ability <= 100)),
  ability_rated_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 新用户自动同步 profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role, openid, username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role,
    (NEW.raw_user_meta_data->>'openid')::text,
    (NEW.raw_user_meta_data->>'username')::text
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 角色辅助函数（避免 RLS 自环）
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- 赛季表
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 活动表（报名接龙）
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  title text NOT NULL,
  activity_time timestamptz NOT NULL,
  location text NOT NULL,
  max_players int NOT NULL DEFAULT 18 CHECK (max_players > 0 AND max_players <= 50),
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 报名表（一个活动一个用户仅一次）
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

-- 赛后数据表（进球/助攻）
CREATE TABLE public.match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  goals int NOT NULL DEFAULT 0 CHECK (goals >= 0 AND goals <= 20),
  assists int NOT NULL DEFAULT 0 CHECK (assists >= 0 AND assists <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

-- 赛季统计视图（出场=报名次数；进球/助攻=赛后填报汇总）
CREATE VIEW public.season_stats
WITH (security_invoker = true)
AS
SELECT
  a.season_id AS season_id,
  r.user_id AS user_id,
  count(r.id)::int AS appearances,
  coalesce(sum(ms.goals), 0)::int AS goals,
  coalesce(sum(ms.assists), 0)::int AS assists
FROM public.registrations r
JOIN public.activities a ON a.id = r.activity_id
LEFT JOIN public.match_stats ms ON ms.activity_id = r.activity_id AND ms.user_id = r.user_id
GROUP BY a.season_id, r.user_id;

-- 报名 RPC：原子检查名额/时间，防止并发超员
CREATE OR REPLACE FUNCTION public.join_activity(p_activity_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := NULL;
  v_max int;
  v_time timestamptz;
  v_count int;
BEGIN
  IF auth.role() = 'authenticated' THEN
    v_uid := auth.uid();
  END IF;

  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'message', '请先登录');
  END IF;

  SELECT a.max_players, a.activity_time INTO v_max, v_time
  FROM public.activities a WHERE a.id = p_activity_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'message', '活动不存在');
  END IF;

  IF v_time < now() THEN
    RETURN json_build_object('ok', false, 'message', '活动已开始，无法报名');
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.registrations r WHERE r.activity_id = p_activity_id;

  IF v_count >= v_max THEN
    RETURN json_build_object('ok', false, 'message', '名额已满');
  END IF;

  INSERT INTO public.registrations (activity_id, user_id)
  VALUES (p_activity_id, v_uid)
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  RETURN json_build_object('ok', true, 'message', '报名成功');
END;
$$;

-- ============ RLS 策略 ============

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Team members view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role IS NOT DISTINCT FROM public.get_user_role(auth.uid()));

-- seasons
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view seasons" ON public.seasons
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage seasons" ON public.seasons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view activities" ON public.activities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage activities" ON public.activities
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- registrations
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view registrations" ON public.registrations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Players join activities" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players cancel own registration" ON public.registrations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage registrations" ON public.registrations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- match_stats
ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view match stats" ON public.match_stats
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Players report own stats" ON public.match_stats
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players update own stats" ON public.match_stats
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage match stats" ON public.match_stats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============ 头像存储桶 ============

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 1048576);

CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatar owner upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatar owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatar owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);