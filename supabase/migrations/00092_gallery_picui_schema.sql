-- 群相册：相册表（单球队，全员可见）
create table public.team_albums (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.team_albums is '群相册-相册';

-- 群相册：照片元数据（图片文件存 picui 图床；记录仅 Edge Function 服务端写入）
create table public.team_photos (
  id uuid not null default gen_random_uuid() primary key,
  album_id uuid not null references public.team_albums(id) on delete cascade,
  picui_key text not null,
  url text not null,
  thumbnail_url text,
  origin_name text,
  width integer,
  height integer,
  size_kb double precision,
  uploaded_by uuid not null references public.profiles(id),
  uploader_name text,
  created_at timestamptz not null default now()
);

comment on table public.team_photos is '群相册-照片元数据（文件存 picui 图床）';

create index team_photos_album_id_idx on public.team_photos(album_id, created_at desc);

-- picui 图床配置（单行表；token 仅服务端 Edge Function 读写，无任何客户端策略）
create table public.picui_config (
  id integer not null default 1 primary key check (id = 1),
  token text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

comment on table public.picui_config is 'picui 图床配置（token 仅服务端可见）';

-- 队长判断（SECURITY DEFINER，供 RLS 策略使用，避免策略自循环）
create or replace function public.is_team_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select case when auth.role() = 'authenticated'
    then coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false)
    else false
  end
$$;

-- 相册列表 RPC（含最新照片封面与统计）
create or replace function public.get_team_albums()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
  from (
    select a.id, a.name, a.description, a.created_by, a.created_at,
      coalesce(p.nickname, p.username, '队员') as creator_name,
      (select count(*)::int from public.team_photos ph where ph.album_id = a.id) as photo_count,
      (select ph2.thumbnail_url from public.team_photos ph2 where ph2.album_id = a.id order by ph2.created_at desc limit 1) as cover_url
    from public.team_albums a
    left join public.profiles p on p.id = a.created_by
  ) t
$$;

revoke execute on function public.get_team_albums() from public, anon;
grant execute on function public.get_team_albums() to authenticated;

-- RLS
alter table public.team_albums enable row level security;
alter table public.team_photos enable row level security;
alter table public.picui_config enable row level security;

-- team_albums：队员可读可建；创建者/队长可改；删除仅经 Edge Function（同步清理图床文件），不设客户端 delete 策略
create policy "team_albums_select_authenticated" on public.team_albums
  for select to authenticated using (true);

create policy "team_albums_insert_authenticated" on public.team_albums
  for insert to authenticated with check (auth.uid() = created_by);

create policy "team_albums_update_creator_or_admin" on public.team_albums
  for update to authenticated
  using (auth.uid() = created_by or public.is_team_admin())
  with check (auth.uid() = created_by or public.is_team_admin());

-- team_photos：队员只读；写入与删除仅 Edge Function（service role）执行
create policy "team_photos_select_authenticated" on public.team_photos
  for select to authenticated using (true);