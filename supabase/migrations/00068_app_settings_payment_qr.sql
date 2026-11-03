-- 全局应用设置表（key-value），用于自定义收款码等团队级配置
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 所有人（含匿名）可读：收款码需展示给全部队员
CREATE POLICY "app settings public read" ON public.app_settings
  FOR SELECT TO public USING (true);

-- 写入仅通过 SECURITY DEFINER RPC（内部校验管理员身份）
CREATE OR REPLACE FUNCTION public.set_payment_qr(p_url text, p_owner text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', '仅管理员可设置收款码');
  END IF;
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    DELETE FROM public.app_settings WHERE key = 'payment_qr';
    RETURN jsonb_build_object('ok', true, 'message', '已恢复默认收款码');
  END IF;
  INSERT INTO public.app_settings (key, value)
    VALUES ('payment_qr', jsonb_build_object('url', trim(p_url), 'owner', trim(coalesce(p_owner, ''))))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'message', '保存成功');
END $function$;