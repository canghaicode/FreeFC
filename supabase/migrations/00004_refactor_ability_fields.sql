-- 能力值拆分：队员自评 / 管理员评定
ALTER TABLE public.profiles DROP COLUMN ability_rated_by_admin;
ALTER TABLE public.profiles RENAME COLUMN ability TO ability_self;
ALTER TABLE public.profiles ADD COLUMN ability_admin int CHECK (ability_admin IS NULL OR (ability_admin >= 1 AND ability_admin <= 100));

-- 非管理员禁止修改 role / ability_admin（管理员评定以管理员为准）
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.ability_admin IS DISTINCT FROM OLD.ability_admin THEN
    RAISE EXCEPTION '无权修改管理员专属字段';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();