-- 蹲坑意愿主表
CREATE TABLE public.kick_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_time text NOT NULL,
  preferred_location text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','converted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kick_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kr_select_all" ON public.kick_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "kr_insert_auth" ON public.kick_requests FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "kr_update_owner_admin" ON public.kick_requests FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (creator_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "kr_delete_owner_admin" ON public.kick_requests FOR DELETE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 蹲坑参与者表
CREATE TABLE public.kick_request_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.kick_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);
ALTER TABLE public.kick_request_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "krp_select_all" ON public.kick_request_participants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "krp_insert_auth" ON public.kick_request_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "krp_delete_self_admin" ON public.kick_request_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- growth_config 新增蹲坑达标阈值
ALTER TABLE public.growth_config ADD COLUMN squat_target integer NOT NULL DEFAULT 8 CHECK (squat_target >= 1);

-- 获取蹲坑列表（含参与者、人数、达标信息），SECURITY DEFINER 统一返回
CREATE FUNCTION public.get_kick_requests(p_status text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_target int;
  v_result jsonb;
BEGIN
  SELECT squat_target INTO v_target FROM public.growth_config WHERE id = 1;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      kr.id, kr.creator_id, kr.preferred_time, kr.preferred_location, kr.note, kr.status, kr.created_at,
      p.nickname AS creator_nickname, p.avatar_url AS creator_avatar,
      COALESCE(pc.cnt, 0) AS participant_count,
      v_target AS target,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', pp.user_id, 'nickname', pp2.nickname, 'avatar_url', pp2.avatar_url))
        FROM public.kick_request_participants pp
        JOIN public.profiles pp2 ON pp2.id = pp.user_id
        WHERE pp.request_id = kr.id
        ORDER BY pp.created_at ASC
      ), '[]'::jsonb) AS participants
    FROM public.kick_requests kr
    LEFT JOIN public.profiles p ON p.id = kr.creator_id
    LEFT JOIN (SELECT request_id, count(*) AS cnt FROM public.kick_request_participants GROUP BY request_id) pc ON pc.request_id = kr.id
    WHERE kr.status = p_status
  ) t;
  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;