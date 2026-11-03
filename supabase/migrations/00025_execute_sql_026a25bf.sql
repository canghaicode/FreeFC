ALTER TABLE public.comment_likes 
  ALTER COLUMN user_id SET DEFAULT auth.uid();