-- 发起蹲坑时自动将发起人计入参与者
CREATE FUNCTION public.auto_join_kick_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.kick_request_participants (request_id, user_id)
  VALUES (NEW.id, NEW.creator_id);
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_auto_join_kick_request
AFTER INSERT ON public.kick_requests
FOR EACH ROW EXECUTE FUNCTION public.auto_join_kick_request();