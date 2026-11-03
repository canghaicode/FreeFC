-- v86：修复外战比赛发布失败，team_groups 约束允许 1-4；外战提交 team_groups=1 时不再 CHECK 失败
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_team_groups_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_team_groups_check CHECK (team_groups BETWEEN 1 AND 4);
