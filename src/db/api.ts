import {supabase} from '@/client/supabase'
import type {
  Activity,
  ActivityComment,
  ActivityWithCount,
  DefenderVoteRow,
  EquipmentCatalog,
  GrowthConfig,
  KickRequest,
  Lineup,
  LineupPosition,
  MatchStats,
  RegistrationGuest,
  MatchSummary,
  MatchVoteKind,
  MatchVoteRow,
  MemberEquipment,
  MemberGrowth,
  MemberSkill,
  PicuiProfile,
  PicuiStatus,
  Poll,
  PollOption,
  PollWithMeta,
  Profile,
  Registration,
  Season,
  SeasonStatsRow,
  SkillCatalog,
  Tactic,
  TacticFeedback,
  TacticLine,
  TacticPlayer,
  TacticTemplate,
  TacticWithActivity,
  TeamAlbum,
  TeamAlbumBase,
  TeamPhoto
} from './types'

/** 获取当前登录用户 ID */
async function getCurrentUserId(): Promise<string | null> {
  const {data} = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/* ---------------- 赛季 ---------------- */

export async function getSeasons(): Promise<Season[]> {
  const {data, error} = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', {ascending: false})
    .limit(50)
  if (error) {
    console.error('getSeasons failed:', error.message)
    return []
  }
  return data ?? []
}

export async function createSeason(name: string, startDate: string | null, endDate: string | null): Promise<boolean> {
  const {error} = await supabase.from('seasons').insert({name, start_date: startDate, end_date: endDate})
  if (error) {
    console.error('createSeason failed:', error.message)
    return false
  }
  return true
}

export async function activateSeason(seasonId: string): Promise<boolean> {
  const {error: e1} = await supabase.from('seasons').update({is_active: false}).eq('is_active', true)
  if (e1) {
    console.error('deactivate seasons failed:', e1.message)
    return false
  }
  const {error: e2} = await supabase.from('seasons').update({is_active: true}).eq('id', seasonId)
  if (e2) {
    console.error('activateSeason failed:', e2.message)
    return false
  }
  return true
}

/* ---------------- 活动 ---------------- */

export async function getActivities(seasonId?: string): Promise<ActivityWithCount[]> {
  let query = supabase
    .from('activities')
    .select('*, regs:registrations(seat_role, guest_count)')
    .order('activity_time', {ascending: false})
    .limit(50)
  if (seasonId) {
    query = query.eq('season_id', seasonId)
  }
  const {data, error} = await query
  if (error) {
    console.error('getActivities failed:', error.message)
    return []
  }
  return (data ?? []) as ActivityWithCount[]
}

export interface ActiveSeasonActivities {
  season: Pick<Season, 'id' | 'name' | 'is_active'> | null
  activities: ActivityWithCount[]
  joinedIds: string[]
}

/** 首页按当前赛季在服务端过滤，不使用小程序请求会破坏的内嵌资源语法。 */
export async function getActiveSeasonActivities(userId?: string | null): Promise<ActiveSeasonActivities> {
  const seasonResult = await supabase.from('seasons').select('id,name,is_active').eq('is_active', true).limit(1).maybeSingle()
  if (seasonResult.error) console.error('getActiveSeasonActivities season failed:', seasonResult.error.message)
  const season = seasonResult.data
  if (!season) return {season: null, activities: [], joinedIds: []}

  const activityResult = await supabase
    .from('activities')
    .select('id,title,activity_time,location,max_players,match_format,match_type,cancelled,season_id,regs:registrations(seat_role,guest_count,user_id)')
    .eq('season_id', season.id)
    .order('activity_time', {ascending: false})
    .limit(50)
  if (activityResult.error) {
    console.error('getActiveSeasonActivities failed:', activityResult.error.message)
    return {season, activities: [], joinedIds: []}
  }

  const rows = (activityResult.data ?? []) as Array<ActivityWithCount & {regs?: Array<{seat_role: string; guest_count: number; user_id?: string}>}>
  return {
    season,
    activities: rows.map((row) => ({
      ...row,
      regs: (row.regs ?? []).map(({seat_role, guest_count}) => ({seat_role, guest_count}))
    })),
    joinedIds: userId ? rows.filter((row) => ((row.regs ?? []) as Array<{user_id?: string}>).some((registration) => registration.user_id === userId)).map((row) => row.id) : []
  }
}

/** 只返回当前用户报名过的活动，避免先拉全量活动再在前端筛选。 */
export async function getJoinedActivities(userId: string): Promise<Activity[]> {
  const registrationResult = await supabase.from('registrations').select('activity_id').eq('user_id', userId).limit(200)
  if (registrationResult.error) {
    console.error('getJoinedActivities registrations failed:', registrationResult.error.message)
    return []
  }
  const activityIds = [...new Set((registrationResult.data ?? []).map((row: {activity_id: string}) => row.activity_id))]
  if (activityIds.length === 0) return []
  const {data, error} = await supabase
    .from('activities')
    .select('id,season_id,title,activity_time,end_time,location,max_players,match_format,match_type,note,notice,coach_slots,captain_slots,team_groups,settled,cancelled,created_by,created_at')
    .in('id', activityIds)
    .order('activity_time', {ascending: false})
    .limit(50)
  if (error) {
    console.error('getJoinedActivities failed:', error.message)
    return []
  }
  return (data ?? []) as Activity[]
}

export async function getActivity(id: string): Promise<Activity | null> {
  const {data, error} = await supabase.from('activities').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('getActivity failed:', error.message)
    return null
  }
  return data
}

export async function createActivity(payload: {
  season_id: string
  title: string
  activity_time: string
  end_time: string | null
  location: string
  max_players: number
  match_format?: '5' | '8' | '11'
  match_type?: 'internal' | 'external'
  cancel_cutoff_mode?: 'hours' | 'sameday'
  cancel_cutoff_value?: number
  coach_slots?: number
  captain_slots?: number
  team_groups?: number
  note: string | null
  notice: string | null
}): Promise<boolean> {
  // 记录活动发起人（用于详情页管理操作区判定）
  let createdBy: string | null = null
  try {
    const {data: userData} = await supabase.auth.getUser()
    createdBy = userData.user?.id || null
  } catch {
    createdBy = null
  }
  const {error} = await supabase.from('activities').insert({
    ...payload,
    created_by: createdBy,
    match_format: payload.match_format || '11',
    match_type: payload.match_type || 'internal',
    coach_slots: payload.coach_slots ?? 0,
    captain_slots: payload.captain_slots ?? 0,
    team_groups: payload.team_groups ?? 2
  })
  if (error) {
    console.error('createActivity failed:', error.message)
    return false
  }
  return true
}

/** 编辑活动（管理员/发起人） */
export async function updateActivity(
  activityId: string,
  payload: {
    title: string
    activity_time: string
    end_time: string | null
    location: string
    max_players: number
    match_format?: '5' | '8' | '11'
    match_type?: 'internal' | 'external'
    cancel_cutoff_mode?: 'hours' | 'sameday'
    cancel_cutoff_value?: number
    coach_slots?: number
    captain_slots?: number
    team_groups?: number
    note: string | null
    notice: string | null
  }
): Promise<boolean> {
  const {error} = await supabase
    .from('activities')
    .update({
      ...payload,
      match_format: payload.match_format || '11',
      match_type: payload.match_type || 'internal',
      coach_slots: payload.coach_slots ?? 0,
      captain_slots: payload.captain_slots ?? 0,
      team_groups: payload.team_groups ?? 2
    })
    .eq('id', activityId)
  if (error) {
    console.error('updateActivity failed:', error.message)
    return false
  }
  return true
}

/** 主教练调整报名分队（A/B/移除） */
export async function setRegistrationTeam(regId: string, team: string | null): Promise<boolean> {
  const {error} = await supabase.rpc('set_registration_team', {p_reg_id: regId, p_team: team})
  if (error) {
    console.error('setRegistrationTeam failed:', error.message)
    return false
  }
  return true
}

/** 管理员/发起人移除任意报名记录（如教练席位） */
export async function removeRegistration(regId: string): Promise<boolean> {
  // 先查出活动与用户，走 cancel_registration 以触发候补自动补位
  const {data: row} = await supabase.from('registrations').select('activity_id, user_id').eq('id', regId).limit(1).maybeSingle()
  if (!row) {
    const {error} = await supabase.from('registrations').delete().eq('id', regId)
    return !error
  }
  const {error} = await supabase.rpc('cancel_registration', {p_activity_id: row.activity_id, p_user_id: row.user_id})
  if (error) {
    console.error('removeRegistration failed:', error.message)
    return false
  }
  return true
}

/** 主教练安排队长/席位 */
export async function setRegistrationSeat(regId: string, seat: 'player' | 'coach' | 'captain'): Promise<boolean> {
  const {error} = await supabase.rpc('set_registration_seat', {p_reg_id: regId, p_seat: seat})
  if (error) {
    console.error('setRegistrationSeat failed:', error.message)
    return false
  }
  return true
}

/** 按评分自动分配尚未分队的成员（仅内战，不改动已有分队） */
export async function autoSplitTeams(activityId: string): Promise<boolean> {
  const {error} = await supabase.rpc('auto_split_teams', {p_activity_id: activityId})
  if (error) {
    console.error('autoSplitTeams failed:', error.message)
    return false
  }
  return true
}

/** 我的累计出勤场次（仅统计已结算且未取消的活动，用于能力上限） */
export async function getMyAppearanceCount(): Promise<number> {
  const userId = await getCurrentUserId()
  if (!userId) return 0
  const {count, error} = await supabase
    .from('registrations')
    .select('id, activities!inner(id)', {count: 'exact', head: true})
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .eq('activities.settled', true)
    .eq('activities.cancelled', false)
  if (error) {
    console.error('getMyAppearanceCount failed:', error.message)
    return 0
  }
  return count || 0
}

/* ---------------- 报名 ---------------- */

/** 删除活动（管理员或发起人；关联报名/填报/阵型级联清除） */
export async function deleteActivity(activityId: string): Promise<boolean> {
  const {error} = await supabase.from('activities').delete().eq('id', activityId)
  if (error) {
    console.error('deleteActivity failed:', error.message)
    return false
  }
  return true
}

/** 取消活动（发起人/管理员；取消后永不结算、不计出场、不发奖励） */
export async function cancelActivity(activityId: string): Promise<{ok: boolean; message?: string}> {
  const {error} = await supabase
    .from('activities')
    .update({cancelled: true})
    .eq('id', activityId)
    .eq('settled', false)
  if (error) {
    console.error('cancelActivity failed:', error.message)
    return {ok: false, message: '取消失败，请重试'}
  }
  return {ok: true}
}

export async function joinActivity(activityId: string): Promise<{ok: boolean; message: string}> {
  const {data, error} = await supabase.rpc('join_activity', {p_activity_id: activityId})
  if (error) {
    console.error('joinActivity failed:', error.message)
    return {ok: false, message: '报名失败，请稍后重试'}
  }
  const result = (data ?? {}) as {ok?: boolean; message?: string}
  return {ok: !!result.ok, message: result.message || (result.ok ? '报名成功' : '报名失败')}
}

export async function cancelRegistration(activityId: string, userId: string): Promise<{ok: boolean; promoted?: string}> {
  const {data, error} = await supabase.rpc('cancel_registration', {p_activity_id: activityId, p_user_id: userId})
  if (error) {
    console.error('cancelRegistration failed:', error.message)
    return {ok: false}
  }
  const resp = (data ?? {}) as {ok?: boolean; promoted?: string}
  return {ok: !!resp.ok, promoted: resp.promoted}
}

export async function getRegistrationsWithProfiles(activityId: string): Promise<Registration[]> {
  const {data, error} = await supabase
    .from('registrations')
    .select(
      '*, profiles(id, nickname, avatar_url, jersey_number, preferred_position, secondary_position, ab_shooting, ab_passing, ab_dribbling, ab_defending, ab_pace, ab_stamina), guests:registration_guests(id, registration_id, activity_id, seq, name, position, team, created_at)'
    )
    .eq('activity_id', activityId)
    .order('created_at', {ascending: true})
    .limit(60)
  if (error) {
    console.error('getRegistrationsWithProfiles failed:', error.message)
    return []
  }
  return data ?? []
}

/** 获取活动全部嘉宾（含携带人昵称，用于报名列表与分队） */
export async function getActivityGuests(activityId: string): Promise<RegistrationGuest[]> {
  const {data, error} = await supabase
    .from('registration_guests')
    .select('id, registration_id, activity_id, seq, name, position, team, created_at, owner:registrations!registration_guests_registration_id_fkey(profiles(nickname))')
    .eq('activity_id', activityId)
    .order('created_at', {ascending: true})
    .limit(200)
  if (error) {
    console.error('getActivityGuests failed:', error.message)
    return []
  }
  return ((data as unknown as any[]) || []).map((g) => ({
    ...g,
    owner_nickname: g.owner?.profiles?.nickname ?? g.owner?.nickname ?? null
  })) as RegistrationGuest[]
}

/** 嘉宾换队（管理员/发起人） */
export async function setGuestTeam(guestId: string, team: string | null): Promise<boolean> {
  const {error} = await supabase.rpc('set_guest_team', {p_guest_id: guestId, p_team: team})
  if (error) {
    console.error('setGuestTeam failed:', error.message)
    return false
  }
  return true
}

/** 手动指定队员场上位置（按活动级别，null=清除回落资料首选） */
export async function setRegistrationPosition(regId: string, position: string | null): Promise<boolean> {
  const {error} = await supabase.rpc('set_registration_position', {p_reg_id: regId, p_position: position})
  if (error) {
    console.error('setRegistrationPosition failed:', error.message)
    return false
  }
  return true
}

/** 手动指定嘉宾场上位置（嘉宾表已有更新策略：本人或管理员） */
export async function setGuestPosition(guestId: string, position: string | null): Promise<boolean> {
  const {error} = await supabase.from('registration_guests').update({position}).eq('id', guestId)
  if (error) {
    console.error('setGuestPosition failed:', error.message)
    return false
  }
  return true
}

/** 查询我在指定活动中的报名情况，返回已报名的活动 ID 集合 */
export async function getMyRegisteredActivityIds(activityIds: string[], userId: string): Promise<string[]> {
  if (activityIds.length === 0) return []
  const {data, error} = await supabase
    .from('registrations')
    .select('activity_id')
    .in('activity_id', activityIds)
    .eq('user_id', userId)
    .limit(200)
  if (error) {
    console.error('getMyRegisteredActivityIds failed:', error.message)
    return []
  }
  return (data ?? []).map((row: {activity_id: string}) => row.activity_id)
}

/* ---------------- 数据统计 ---------------- */

export async function getSeasonStats(seasonId: string, matchFormat?: '5' | '8' | '11'): Promise<SeasonStatsRow[]> {
  // 传赛制时查分赛制视图（只统计该赛制的比赛），不传则查赛季总量视图
  const base = matchFormat
    ? supabase.from('season_stats_by_format').select('*').eq('season_id', seasonId).eq('match_format', matchFormat)
    : supabase.from('season_stats').select('*').eq('season_id', seasonId)
  const {data, error} = await base
    .order('appearances', {ascending: false})
    .order('goals', {ascending: false})
    .order('assists', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getSeasonStats failed:', error.message)
    return []
  }
  return data ?? []
}

/** 当前用户在各赛季的统计，供个人页按当前赛季取一行。 */
export async function getUserSeasonStats(userId: string): Promise<SeasonStatsRow[]> {
  const {data, error} = await supabase
    .from('season_stats')
    .select('season_id,user_id,nickname,avatar_url,jersey_number,position,appearances,goals,assists')
    .eq('user_id', userId)
    .limit(20)
  if (error) {
    console.error('getUserSeasonStats failed:', error.message)
    return []
  }
  return data ?? []
}

/** 计算用户本赛季已解锁的条件称号 key 列表（金靴/银靴/铜靴/助攻王/防守铁闸/MVP） */
export async function getMySeasonHonors(seasonId: string, userId: string): Promise<string[]> {
  if (!seasonId || !userId) return []
  const honors: string[] = []
  const rankMap = (entries: {id: string; value: number}[]) => {
    const map = new Map<string, number>()
    let rank = 0
    let prev: number | null = null
    for (const e of entries) {
      if (prev === null || e.value !== prev) {
        rank = prev === null ? 1 : rank + 1
        prev = e.value
      }
      map.set(e.id, rank)
    }
    return map
  }
  const stats = await getSeasonStats(seasonId)
  const gRank = rankMap(
    stats.filter((s) => s.goals > 0).map((s) => ({id: s.user_id, value: s.goals})).sort((a, b) => b.value - a.value)
  ).get(userId)
  if (gRank === 1) honors.push('golden_boot')
  else if (gRank === 2) honors.push('silver_boot')
  else if (gRank === 3) honors.push('bronze_boot')
  const aRank = rankMap(
    stats.filter((s) => s.assists > 0).map((s) => ({id: s.user_id, value: s.assists})).sort((a, b) => b.value - a.value)
  ).get(userId)
  if (aRank === 1) honors.push('assist_king')
  const dv = await getDefenderVoteInfo(seasonId)
  const dRank = rankMap(
    (dv?.ranking || []).filter((r) => r.points > 0).map((r) => ({id: r.candidate_id, value: r.points}))
  ).get(userId)
  if (dRank === 1) honors.push('defense_wall')
  const {data: acts} = await supabase.from('activities').select('id').eq('season_id', seasonId)
  const actIds = new Set((acts || []).map((a: {id: string}) => a.id))
  // 本赛季 MVP 获奖次数
  if (actIds.size > 0) {
    const mvpWins = new Map<string, number>()
    const {data: mvpVotes} = await supabase
      .from('match_votes')
      .select('activity_id, candidate_id')
      .eq('kind', 'mvp')
      .in('activity_id', [...actIds])
    const mvpList = (mvpVotes || []) as {activity_id: string; candidate_id: string}[]
    const perAct = new Map<string, Map<string, number>>()
    for (const v of mvpList) {
      const m = perAct.get(v.activity_id) || new Map<string, number>()
      m.set(v.candidate_id, (m.get(v.candidate_id) || 0) + 1)
      perAct.set(v.activity_id, m)
    }
    for (const actMap of perAct.values()) {
      const maxVotes = Math.max(0, ...Array.from(actMap.values()).map((n) => n))
      if (maxVotes === 0) continue
      for (const [cid, n] of actMap.entries()) {
        if (n === maxVotes) mvpWins.set(cid, (mvpWins.get(cid) || 0) + 1)
      }
    }
    if ((mvpWins.get(userId) || 0) >= 1) honors.push('mvp')
  }
  return honors
}

/* ---------------- 赛后数据 ---------------- */

export async function upsertMatchStats(
  activityId: string,
  goals: number,
  assists: number
): Promise<{ok: boolean; message?: string}> {
  const userId = await getCurrentUserId()
  if (!userId) return {ok: false, message: '请先登录'}
  // 已取消 / 12 小时截止校验
  const {data: act} = await supabase.from('activities').select('end_time, activity_time, cancelled').eq('id', activityId).maybeSingle()
  if (act?.cancelled) return {ok: false, message: '活动已取消，无法填报数据'}
  if (act && new Date(act.end_time || act.activity_time).getTime() + 12 * 3600 * 1000 <= Date.now()) {
    return {ok: false, message: '数据填报已截止，系统已结算不可修改'}
  }
  const {error} = await supabase
    .from('match_stats')
    .upsert({activity_id: activityId, user_id: userId, goals, assists}, {onConflict: 'activity_id,user_id'})
  if (error) {
    console.error('upsertMatchStats failed:', error.message)
    return {ok: false, message: '填报失败'}
  }
  return {ok: true}
}

export async function getMyMatchStats(activityId: string): Promise<MatchStats | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  const {data, error} = await supabase
    .from('match_stats')
    .select('*')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('getMyMatchStats failed:', error.message)
    return null
  }
  return data
}

/** 我的所有赛后填报记录 */
export async function getMyAllMatchStats(): Promise<MatchStats[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data, error} = await supabase
    .from('match_stats')
    .select('*')
    .eq('user_id', userId)
    .limit(200)
  if (error) {
    console.error('getMyAllMatchStats failed:', error.message)
    return []
  }
  return data ?? []
}

/* ---------------- 球队名单与资料 ---------------- */

const SQUAD_ROSTER_COLUMNS =
  'id,nickname,avatar_url,jersey_number,preferred_position,secondary_position,role,title,traits,activity,free_points,ab_shooting,ab_passing,ab_dribbling,ab_defending,ab_pace,ab_stamina,' +
  'member_skills(id, equipped, level, skill:skill_catalog(name, kind, rarity, bonus_key, bonus_value)),' +
  'member_equipment(id, equipped, equipment:equipment_catalog!member_equipment_equipment_id_fkey(bonuses))'

/** 名单和队长管理使用的资料（含技能/装备，用于统一计算总评口径）。 */
export async function getSquadRoster(): Promise<Profile[]> {
  const {data, error} = await supabase
    .from('profiles')
    .select(SQUAD_ROSTER_COLUMNS)
    .order('jersey_number', {ascending: true, nullsFirst: false})
    .limit(500)
  if (error) {
    console.error('getSquadRoster failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as Profile[]
}
/** 球星卡需要技能与装备加成；只取计算用到的字段。 */
export async function getSquad(): Promise<Profile[]> {
  const {data, error} = await supabase
    .from('profiles')
    .select('*, member_skills(id, equipped, level, skill:skill_catalog(name, kind, rarity, bonus_key, bonus_value)), member_equipment(id, equipped, equipment:equipment_catalog!member_equipment_equipment_id_fkey(bonuses))')
    .order('jersey_number', {ascending: true, nullsFirst: false})
    .limit(500)
  if (error) {
    console.error('getSquad failed:', error.message)
    return []
  }
  return data ?? []
}

/** 单个队员完整资料（含技能/装备加成），供详情弹层直接使用。 */
export async function getSquadMember(userId: string): Promise<Profile | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select('*, member_skills(id, equipped, level, skill:skill_catalog(name, kind, rarity, bonus_key, bonus_value)), member_equipment(id, equipped, equipment:equipment_catalog!member_equipment_equipment_id_fkey(bonuses))')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('getSquadMember failed:', error.message)
    return null
  }
  return (data as Profile) ?? null
}

/** 管理员变更成员角色（服务端校验：仅管理员/不可操作自己/保留至少一名管理员） */
export async function setMemberRole(userId: string, role: 'admin' | 'user'): Promise<{ok: boolean; message: string}> {
  const {data, error} = await supabase.rpc('set_member_role', {target_uid: userId, new_role: role})
  if (error) {
    console.error('setMemberRole failed:', error.message)
    return {ok: false, message: error.message || '操作失败，请重试'}
  }
  return {ok: true, message: (data as string) || '操作成功'}
}

export async function updateOwnProfile(
  updates: Partial<
    Pick<
      Profile,
      | 'nickname'
      | 'avatar_url'
      | 'jersey_number'
      | 'preferred_position'
      | 'secondary_position'
      | 'ab_shooting'
      | 'ab_passing'
      | 'ab_dribbling'
      | 'ab_defending'
      | 'ab_pace'
      | 'ab_stamina'
      | 'preferred_foot'
      | 'foot_skill'
      | 'weak_foot_skill'
      | 'traits'
      | 'title'
      | 'age'
    >
  >
): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false
  const {error} = await supabase.from('profiles').update(updates).eq('id', userId)
  if (error) {
    console.error('updateOwnProfile failed:', error.message)
    return false
  }
  return true
}

/* ---------------- 首发阵型 ---------------- */

/** 获取活动阵型 */
export async function getLineup(activityId: string): Promise<Lineup | null> {
  const {data, error} = await supabase
    .from('lineups')
    .select('*')
    .eq('activity_id', activityId)
    .maybeSingle()
  if (error) {
    console.error('getLineup failed:', error.message)
    return null
  }
  return (data as Lineup) ?? null
}

/** 管理员保存阵型（按 activity_id upsert） */
export async function saveLineup(
  activityId: string,
  formation: string,
  positions: LineupPosition[]
): Promise<boolean> {
  const userId = await getCurrentUserId()
  const {error} = await supabase.from('lineups').upsert(
    {
      activity_id: activityId,
      formation,
      positions,
      updated_by: userId,
      updated_at: new Date().toISOString()
    },
    {onConflict: 'activity_id'}
  )
  if (error) {
    console.error('saveLineup failed:', error.message)
    return false
  }
  return true
}

// ==================== 活动评论 ====================

/** 活动评论列表（含评论人/被回复人/点赞数，时间正序便于盖楼） */
export async function getActivityComments(activityId: string): Promise<ActivityComment[]> {
  const {data, error} = await supabase
    .from('activity_comments')
    .select('id, activity_id, user_id, content, parent_id, reply_to_user_id, created_at, profiles!activity_comments_user_id_fkey(nickname, avatar_url), reply_to:profiles!activity_comments_reply_to_user_id_fkey(nickname), comment_likes(count)')
    .eq('activity_id', activityId)
    .order('created_at', {ascending: true})
    .limit(500)
  if (error) {
    console.error('getActivityComments failed:', error.message)
    return []
  }
  return (data as unknown as ActivityComment[]) || []
}

/** 发表活动评论（parentId 传入则为盖楼回复） */
export async function addActivityComment(
  activityId: string,
  content: string,
  parentId?: string,
  replyToUserId?: string
): Promise<ActivityComment | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  const text = content.trim()
  if (!text) return null
  const {data, error} = await supabase
    .from('activity_comments')
    .insert({
      activity_id: activityId,
      user_id: userId,
      content: text,
      parent_id: parentId || null,
      reply_to_user_id: replyToUserId || null
    })
    .select('id, activity_id, user_id, content, parent_id, reply_to_user_id, created_at, profiles!activity_comments_user_id_fkey(nickname, avatar_url)')
    .single()
  if (error) {
    console.error('addActivityComment failed:', error.message)
    return null
  }
  return data as unknown as ActivityComment
}

/** 我在某活动点赞过的评论 ID 列表 */
export async function getMyLikedCommentIds(activityId: string): Promise<string[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data: cmts} = await supabase
    .from('activity_comments')
    .select('id')
    .eq('activity_id', activityId)
    .limit(500)
  const ids = (cmts || []).map((c) => (c as {id: string}).id)
  if (ids.length === 0) return []
  const {data, error} = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', userId)
    .in('comment_id', ids)
  if (error || !data) return []
  return (data as unknown as {comment_id: string}[]).map((r) => r.comment_id)
}

/** 点赞 / 取消点赞评论 */
export async function toggleCommentLike(commentId: string, liked: boolean): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false
  if (liked) {
    const {error} = await supabase.from('comment_likes').insert({comment_id: commentId, user_id: userId})
    if (error) {
      console.error('likeComment failed:', error.message)
      return false
    }
    return true
  }
  const {error} = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId)
  if (error) {
    console.error('unlikeComment failed:', error.message)
    return false
  }
  return true
}

/** 自由属性点加点（FIFA 体系：受上限约束） */
export async function allocPoints(key: string, delta: number): Promise<{ok: boolean; message?: string; remaining?: number}> {
  const {data, error} = await supabase.rpc('alloc_points', {p_key: key, p_delta: delta})
  if (error) {
    return {ok: false, message: error.message || '加点失败'}
  }
  return {ok: true, remaining: (data as number) ?? undefined}
}

/** 出勤结算（管理员：按后台配置的每场经验/活跃度结算、升级发点） */
export async function settleActivity(
  activityId: string
): Promise<{ok: boolean; message?: string}> {
  const {error} = await supabase.rpc('settle_activity_activity', {p_activity_id: activityId})
  if (error) {
    return {ok: false, message: error.message || '结算失败'}
  }
  return {ok: true}
}

/** 读取队长后台配置的成长数值 */
export function defaultGrowthConfig(): GrowthConfig {
  return {
    id: 1,
    exp_per_level: 100,
    exp_per_match: 100,
    activity_per_match: 100,
    points_per_level: 5,
    mvp_exp: 50,
    mvp_activity: 15,
    defender_exp: 50,
    defender_activity: 15,
    goal_exp: 30,
    goal_activity: 5,
    assist_exp: 20,
    assist_activity: 5,
    squat_target: 8,
    updated_by: null,
    updated_at: ''
  }
}

export async function getGrowthConfig(): Promise<GrowthConfig> {
  const {data, error} = await supabase.from('growth_config').select('*').eq('id', 1).maybeSingle()
  if (error || !data) {
    return defaultGrowthConfig()
  }
  return data as GrowthConfig
}

/** 保存队长后台成长数值配置（仅管理员，RLS 强制） */
export async function updateGrowthConfig(payload: {
  exp_per_level: number
  exp_per_match: number
  activity_per_match: number
  points_per_level: number
  mvp_exp: number
  mvp_activity: number
  defender_exp: number
  defender_activity: number
  goal_exp: number
  goal_activity: number
  assist_exp: number
  assist_activity: number
  squat_target: number
}): Promise<boolean> {
  const uid = await getCurrentUserId()
  const {error} = await supabase
    .from('growth_config')
    .update({
      ...payload,
      updated_by: uid || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1)
  if (error) {
    console.error('updateGrowthConfig failed:', error.message)
    return false
  }
  return true
}

/* ---------------- 蹲坑意愿 ---------------- */

/** 获取蹲坑列表（含参与者与达标信息） */
export async function getKickRequests(status: 'open' | 'closed' | 'converted' = 'open'): Promise<KickRequest[]> {
  const {data, error} = await supabase.rpc('get_kick_requests', {p_status: status})
  if (error || !data) {
    console.error('getKickRequests failed:', error?.message)
    return []
  }
  return data as KickRequest[]
}

/** 发起蹲坑（发起人由触发器自动加入参与者） */
export async function createKickRequest(payload: {
  preferred_time: string
  preferred_location: string
  note: string
}): Promise<boolean> {
  const {error} = await supabase.from('kick_requests').insert({
    preferred_time: payload.preferred_time.trim(),
    preferred_location: payload.preferred_location.trim(),
    note: payload.note.trim()
  })
  if (error) {
    console.error('createKickRequest failed:', error.message)
    return false
  }
  return true
}

/** 加入蹲坑 */
export async function joinKickRequest(requestId: string): Promise<boolean> {
  const {error} = await supabase.from('kick_request_participants').insert({request_id: requestId})
  if (error) {
    console.error('joinKickRequest failed:', error.message)
    return false
  }
  return true
}

/** 退出蹲坑 */
export async function leaveKickRequest(requestId: string): Promise<boolean> {
  const uid = await getCurrentUserId()
  if (!uid) return false
  const {error} = await supabase
    .from('kick_request_participants')
    .delete()
    .eq('request_id', requestId)
    .eq('user_id', uid)
  if (error) {
    console.error('leaveKickRequest failed:', error.message)
    return false
  }
  return true
}

/** 关闭蹲坑（发起人/队长） */
export async function closeKickRequest(requestId: string): Promise<boolean> {
  const {error} = await supabase
    .from('kick_requests')
    .update({status: 'closed', updated_at: new Date().toISOString()})
    .eq('id', requestId)
  if (error) {
    console.error('closeKickRequest failed:', error.message)
    return false
  }
  return true
}

/** 将蹲坑标记为已转活动（队长） */
export async function convertKickRequest(requestId: string): Promise<boolean> {
  const {error} = await supabase
    .from('kick_requests')
    .update({status: 'converted', updated_at: new Date().toISOString()})
    .eq('id', requestId)
  if (error) {
    console.error('convertKickRequest failed:', error.message)
    return false
  }
  return true
}

/** 我已装备/解锁的技能（含加成定义） */
export async function getMyMemberSkills(): Promise<MemberSkill[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  return getMemberSkills(userId)
}

/* ---------------- 装备系统 ---------------- */

/** 全部装备目录 */
export async function getEquipmentCatalog(): Promise<EquipmentCatalog[]> {
  const {data, error} = await supabase
    .from('equipment_catalog')
    .select('*')
    .order('sort_order', {ascending: true})
    .limit(100)
  if (error) {
    console.error('getEquipmentCatalog failed:', error.message)
    return []
  }
  return Array.isArray(data) ? data : []
}

/** 我已拥有的装备（含装备定义） */
export async function getMyEquipment(): Promise<MemberEquipment[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data, error} = await supabase
    .from('member_equipment')
    .select('*, equipment:equipment_catalog!member_equipment_equipment_id_fkey(*)')
    .eq('user_id', userId)
    .order('unlocked_at', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getMyEquipment failed:', error.message)
    return []
  }
  return Array.isArray(data) ? data : []
}

/** 活跃度兑换装备 */
export async function purchaseEquipment(equipmentId: string): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('purchase_equipment', {p_equipment_id: equipmentId})
  if (error) {
    console.error('purchaseEquipment failed:', error.message)
    return {ok: false, message: '兑换失败，请重试'}
  }
  const res = (data ?? {}) as {ok?: boolean; message?: string}
  return {ok: !!res.ok, message: res.message || (res.ok ? '兑换成功' : '兑换失败')}
}

/** 装备/卸下装备 */
export async function toggleEquipment(memberEquipmentId: string): Promise<{ok: boolean; message?: string; equipped?: boolean}> {
  const {data, error} = await supabase.rpc('toggle_equipment', {p_member_equipment_id: memberEquipmentId})
  if (error) {
    console.error('toggleEquipment failed:', error.message)
    return {ok: false, message: '操作失败，请重试'}
  }
  const res = (data ?? {}) as {ok?: boolean; message?: string; equipped?: boolean}
  return {ok: !!res.ok, message: res.message || '操作成功', equipped: res.equipped}
}

/** 活跃度兑换属性点 */
export async function exchangeActivityToPoints(points: number): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('exchange_activity_to_points', {p_points: points})
  if (error) {
    console.error('exchangeActivityToPoints failed:', error.message)
    return {ok: false, message: '兑换失败，请重试'}
  }
  const res = (data ?? {}) as {ok?: boolean; message?: string}
  return {ok: !!res.ok, message: res.message || (res.ok ? '兑换成功' : '兑换失败')}
}

/** 删除评论（本人或管理员） */
export async function deleteActivityComment(commentId: string): Promise<boolean> {
  const {error} = await supabase.from('activity_comments').delete().eq('id', commentId)
  if (error) {
    console.error('deleteActivityComment failed:', error.message)
    return false
  }
  return true
}

// ==================== 队内事务投票 ====================

/** 事务投票列表（含选项与计票、本人已投项） */
export async function getPolls(): Promise<PollWithMeta[]> {
  const {data, error} = await supabase
    .from('polls')
    .select('id, season_id, title, created_by, is_closed, created_at, profiles(nickname), poll_options(id, poll_id, label, sort_order)')
    .order('created_at', {ascending: false})
    .limit(50)
  if (error) {
    console.error('getPolls failed:', error.message)
    return []
  }
  const polls = (data as unknown as (Poll & {poll_options: PollOption[]})[]) || []
  if (polls.length === 0) return []
  const {data: votes} = await supabase
    .from('poll_votes')
    .select('poll_id, option_id, user_id')
  const voteList = (votes as {poll_id: string; option_id: string; user_id: string}[]) || []
  const userId = await getCurrentUserId()
  return polls.map((p) => ({
    ...p,
    options: (p.poll_options || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({id: o.id, label: o.label, votes: voteList.filter((v) => v.option_id === o.id).length})),
    my_option_id: voteList.find((v) => v.poll_id === p.id && v.user_id === userId)?.option_id || null
  }))
}

/** 是否存在进行中的事务投票（首页入口显隐用，轻量查询） */
export async function hasOpenPolls(): Promise<boolean> {
  const {data, error} = await supabase
    .from('polls')
    .select('id')
    .eq('is_closed', false)
    .limit(1)
  if (error) {
    console.error('hasOpenPolls failed:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

/** 创建事务投票（标题 + 选项列表，选项至少2个） */
export async function createPoll(
  title: string,
  options: string[],
  seasonId: string | null
): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false
  const t = title.trim()
  const opts = options.map((o) => o.trim()).filter(Boolean)
  if (!t || opts.length < 2) return false
  const {data, error} = await supabase
    .from('polls')
    .insert({title: t, created_by: userId, season_id: seasonId})
    .select('id')
    .single()
  if (error || !data) {
    console.error('createPoll failed:', error?.message)
    return false
  }
  const {error: optErr} = await supabase.from('poll_options').insert(
    opts.map((label, i) => ({poll_id: (data as {id: string}).id, label, sort_order: i}))
  )
  if (optErr) {
    console.error('createPoll options failed:', optErr.message)
    return false
  }
  return true
}

/** 投票（一人一票，可改投；先删旧票再投新票） */
export async function castPollVote(pollId: string, optionId: string): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId || !pollId || !optionId) return false
  const {error: delErr} = await supabase
    .from('poll_votes')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', userId)
  if (delErr) {
    console.error('castPollVote delete failed:', delErr.message)
    return false
  }
  const {error} = await supabase
    .from('poll_votes')
    .insert({poll_id: pollId, option_id: optionId, user_id: userId})
  if (error) {
    console.error('castPollVote failed:', error.message)
    return false
  }
  return true
}

/** 关闭/开启投票（发起人或管理员） */
export async function togglePollClosed(pollId: string, closed: boolean): Promise<boolean> {
  const {error} = await supabase.from('polls').update({is_closed: closed}).eq('id', pollId)
  if (error) {
    console.error('togglePollClosed failed:', error.message)
    return false
  }
  return true
}

// ==================== 最佳防守球员投票 ====================

/** 当前赛季最佳防守获奖榜（按活动次数计，每场最多1次，同场并列各算1次） */
export async function getDefenderVoteInfo(seasonId: string, matchFormat?: '5' | '8' | '11'): Promise<{
  ranking: DefenderVoteRow[]
} | null> {
  let actQuery = supabase.from('activities').select('id').eq('season_id', seasonId)
  if (matchFormat) actQuery = actQuery.eq('match_format', matchFormat)
  const {data: acts} = await actQuery
  const actIds = (acts || []).map((a: {id: string}) => a.id)
  if (actIds.length === 0) return {ranking: []}
  // 按活动聚合 match_votes(kind='defender')，取每场的最高票候选人
  const {data: votes} = await supabase
    .from('match_votes')
    .select('activity_id, candidate_id, profiles!match_votes_candidate_id_fkey(nickname, avatar_url, jersey_number)')
    .eq('kind', 'defender')
    .in('activity_id', actIds)
  const rows = (votes || []) as unknown as {
    activity_id: string
    candidate_id: string
    profiles?: {nickname: string | null; avatar_url: string | null; jersey_number: number | null} | null
  }[]
  // 统计每场每个候选人得票数
  const actCandidateVotes = new Map<string, Map<string, {profiles: typeof rows[0]['profiles']; count: number}>>()
  for (const r of rows) {
    const actMap = actCandidateVotes.get(r.activity_id) || new Map()
    const cur = actMap.get(r.candidate_id) || {profiles: r.profiles, count: 0}
    cur.count++
    actMap.set(r.candidate_id, cur)
    actCandidateVotes.set(r.activity_id, actMap)
  }
  // 每场取最高票（并列均算）
  const wins = new Map<string, {profiles: typeof rows[0]['profiles']; wins: number}>()
  for (const actMap of actCandidateVotes.values()) {
    const maxVotes = Math.max(0, ...Array.from(actMap.values()).map((v) => v.count))
    if (maxVotes === 0) continue
    for (const [cid, v] of actMap.entries()) {
      if (v.count === maxVotes) {
        const prev = wins.get(cid) || {profiles: v.profiles, wins: 0}
        prev.wins++
        wins.set(cid, prev)
      }
    }
  }
  const ranking: DefenderVoteRow[] = Array.from(wins.entries())
    .map(([candidate_id, v]) => ({candidate_id, points: v.wins, profiles: v.profiles || null}))
    .sort((a, b) => b.points - a.points)
  return {ranking}
}

/** 队内成员列表（防守投票候选，排除本人） */
export async function getVoteCandidates(): Promise<Profile[]> {
  const userId = await getCurrentUserId()
  const list = await getSquadRoster()
  return list.filter((p) => p.id !== userId)
}

/** 投出单场 MVP/最佳防守球员票（已废弃赛季点数投票，统一使用 castMatchVote） */
export async function castDefenderVote(): Promise<{ok: boolean; message?: string}> {
  return {ok: false, message: '请在活动详情页赛后投票入口投票'}
}

// ==================== 等级 / 活跃度 / 火力值 ====================

/** 全队成长数据（含等级、活跃度、火力值），按火力值降序 */
export async function getMemberGrowth(): Promise<MemberGrowth[]> {
  const {data, error} = await supabase
    .from('member_growth')
    .select('id, nickname, avatar_url, jersey_number, preferred_position, role, activity, level, appearances, goals, assists, def_votes, firepower')
    .order('firepower', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getMemberGrowth failed:', error.message)
    return []
  }
  return (data as MemberGrowth[]) || []
}

/** 出勤结算活跃度（管理员触发，每出勤 +100） */
export async function settleActivityActivity(activityId: string): Promise<boolean> {
  const {error} = await supabase.rpc('settle_activity_activity', {p_activity_id: activityId})
  if (error) {
    console.error('settleActivityActivity failed:', error.message)
    return false
  }
  return true
}

/** 管理员调整队员等级（同步重置活跃度至档位下限） */
export async function adminSetLevel(targetUid: string, level: number): Promise<boolean> {
  const {error} = await supabase.rpc('admin_set_level', {p_target_uid: targetUid, p_level: level})
  if (error) {
    console.error('adminSetLevel failed:', error.message)
    return false
  }
  return true
}

/** 管理员手动修正活跃度 */
export async function adminAdjustActivity(targetUid: string, delta: number): Promise<boolean> {
  const {error} = await supabase.rpc('admin_adjust_activity', {p_target_uid: targetUid, p_delta: delta})
  if (error) {
    console.error('adminAdjustActivity failed:', error.message)
    return false
  }
  return true
}

/** 队长后台：重置队员资料（昵称恢复默认、清空球衣号与位置） */
export async function captainResetProfile(targetUid: string): Promise<{ok: boolean; message: string}> {
  const {error} = await supabase.rpc('captain_reset_member_profile', {p_target_uid: targetUid})
  if (error) {
    console.error('captainResetProfile failed:', error.message)
    return {ok: false, message: error.message || '重置失败'}
  }
  return {ok: true, message: '资料已重置'}
}

/** 队长后台：直接调整队员六维能力值与自由属性点 */
export async function captainSetAbilities(
  targetUid: string,
  values: Record<string, number>
): Promise<{ok: boolean; message: string}> {
  const {error} = await supabase.rpc('captain_set_member_abilities', {p_target_uid: targetUid, p_values: values})
  if (error) {
    console.error('captainSetAbilities failed:', error.message)
    return {ok: false, message: error.message || '保存失败'}
  }
  return {ok: true, message: '能力值已保存'}
}

// ==================== FIFA 特性 / 技能 ====================

/** 技能库（全部） */
export async function getSkillCatalog(): Promise<SkillCatalog[]> {
  const {data, error} = await supabase
    .from('skill_catalog')
    .select('id, kind, name, description, cost, cost_points, max_level, sort_order, rarity, bonus_key, bonus_value')
    .order('sort_order', {ascending: true})
  if (error) {
    console.error('getSkillCatalog failed:', error.message)
    return []
  }
  return (data as SkillCatalog[]) || []
}

/** 指定队员已解锁的技能（含技能详情） */
export async function getMemberSkills(userId: string): Promise<MemberSkill[]> {
  const {data, error} = await supabase
    .from('member_skills')
    .select('id, user_id, skill_id, equipped, level, unlocked_at, skill:skill_catalog(id, kind, name, description, cost, cost_points, max_level, sort_order, rarity, bonus_key, bonus_value)')
    .eq('user_id', userId)
    .order('unlocked_at', {ascending: false})
  if (error) {
    console.error('getMemberSkills failed:', error.message)
    return []
  }
  return (data as unknown as MemberSkill[]) || []
}

/** 解锁技能/特性（扣能力点） */
export async function unlockSkill(skillId: string): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('unlock_skill', {p_skill_id: skillId})
  if (error) {
    console.error('unlockSkill failed:', error.message)
    return {ok: false, message: error.message}
  }
  const resp = data as {ok?: boolean; message?: string}
  return {ok: !!resp?.ok, message: resp?.message}
}

/** 升级技能/特性（扣能力点，加成随等级增长） */
export async function upgradeSkill(skillId: string): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('upgrade_skill', {p_skill_id: skillId})
  if (error) {
    console.error('upgradeSkill failed:', error.message)
    return {ok: false, message: error.message}
  }
  const resp = data as {ok?: boolean; message?: string}
  return {ok: !!resp?.ok, message: resp?.message}
}

/** 装备原价出售（返还全部购买活跃度） */
export async function sellEquipment(memberEquipmentId: string): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('sell_equipment', {p_member_equipment_id: memberEquipmentId})
  if (error) {
    console.error('sellEquipment failed:', error.message)
    return {ok: false, message: '出售失败，请重试'}
  }
  const resp = data as {ok?: boolean; message?: string}
  return {ok: !!resp?.ok, message: resp?.message}
}

/** 装备/卸下技能 */
export async function toggleSkillEquipped(skillId: string, equipped: boolean): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('toggle_skill_equipped', {p_skill_id: skillId, p_equipped: equipped})
  if (error) {
    console.error('toggleSkillEquipped failed:', error.message)
    return {ok: false, message: error.message}
  }
  const resp = data as {ok?: boolean; message?: string}
  return {ok: !!resp?.ok, message: resp?.message}
}

// ==================== 主队选择 ====================

/** 设置本人主队 */
export async function setHomeTeam(team: string): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false
  const {error} = await supabase.from('profiles').update({home_team: team || null}).eq('id', userId)
  if (error) {
    console.error('setHomeTeam failed:', error.message)
    return false
  }
  return true
}

// ==================== 战术板 ====================

/** 报名时指定席位角色（player/coach/captain） */
export async function joinWithSeat(
  activityId: string,
  seatRole: 'player' | 'coach' | 'captain',
  guestCount = 0,
  guests?: {name?: string; position?: string}[]
): Promise<{ok: boolean; message: string}> {
  const {data, error} = await supabase.rpc('join_with_seat', {
    p_activity_id: activityId,
    p_seat_role: seatRole,
    p_guest_count: guestCount,
    p_guests: guests || []
  })
  if (error) {
    console.error('joinWithSeat failed:', error.message)
    return {ok: false, message: error.message}
  }
  const resp = data as {ok?: boolean; message?: string}
  return {ok: !!resp?.ok, message: resp?.message || '报名失败'}
}

/* ---------------- 球员综合评分 ---------------- */

export interface PlayerRatingRow {
  user_id: string
  avg_rating: number | null
  rating_count: number
}

/** 评分列表专用精简行（资料与均分由单次 RPC 返回） */
export interface RatingMemberRow {
  id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  preferred_position: string | null
  avg_rating: number | null
  rating_count: number
}

/** 单次获取评分列表所需资料与汇总，避免先查名单再串行查询评分 */
export async function getRatingMembers(): Promise<RatingMemberRow[]> {
  const {data, error} = await supabase.rpc('get_rating_members')
  if (error) {
    console.error('getRatingMembers failed:', error.message)
    return []
  }
  return ((data || []) as RatingMemberRow[]).map((row) => ({
    ...row,
    avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
    rating_count: Number(row.rating_count)
  }))
}

export interface PlayerRatingDetailRow {
  id: string
  rater_id: string
  score: number
  comment: string | null
  tags: string[]
  updated_at: string
  rater: {nickname: string | null; avatar_url: string | null}
}

/** 获取某球员获得的全部评分（含评分人昵称、标签与评论），用于详情展示 */
export async function getPlayerRatings(ratedId: string): Promise<PlayerRatingDetailRow[]> {
  const {data, error} = await supabase
    .from('player_ratings')
    .select('id, rater_id, score, comment, tags, updated_at, rater:profiles!player_ratings_rater_id_fkey(nickname, avatar_url)')
    .eq('rated_id', ratedId)
    .order('updated_at', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getPlayerRatings failed:', error.message)
    return []
  }
  return (data as unknown as PlayerRatingDetailRow[]) || []
}

/** 批量获取一批球员的平均评分（用于列表展示） */
export async function getPlayerAvgRatings(userIds: string[]): Promise<Map<string, PlayerRatingRow>> {
  const map = new Map<string, PlayerRatingRow>()
  if (userIds.length === 0) return map
  const {data, error} = await supabase.rpc('get_player_avg_ratings', {p_user_ids: userIds})
  if (error) {
    console.error('getPlayerAvgRatings failed:', error.message)
    return map
  }
  for (const row of (data || []) as PlayerRatingRow[]) {
    map.set(row.user_id, row)
  }
  return map
}

/** 一次取全部球员均分，供名单页与资料查询并行。 */
export async function getAllPlayerAvgRatings(): Promise<Map<string, PlayerRatingRow>> {
  const map = new Map<string, PlayerRatingRow>()
  const {data, error} = await supabase.from('player_avg_ratings').select('user_id,avg_rating,rating_count').limit(500)
  if (error) {
    console.error('getAllPlayerAvgRatings failed:', error.message)
    return map
  }
  for (const row of (data || []) as PlayerRatingRow[]) {
    map.set(row.user_id, {
      ...row,
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
      rating_count: Number(row.rating_count)
    })
  }
  return map
}


/** 提交评分（自评或互评，同对覆盖，可附标签与评论） */
export async function submitPlayerRating(ratedId: string, score: number, tags: string[] = [], comment?: string): Promise<boolean> {
  const {error} = await supabase
    .from('player_ratings')
    .upsert({rated_id: ratedId, score, tags, comment: comment?.trim() || null}, {onConflict: 'rater_id,rated_id'})
  if (error) {
    console.error('submitPlayerRating failed:', error.message)
    return false
  }
  return true
}

/* ---------------- 赛后匿名表现分 ---------------- */

export interface PostMatchRatingParticipant {
  id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  team: string | null
}

export interface PostMatchRatingForm {
  eligible: boolean
  submitted: boolean
  should_prompt: boolean
  reason: string | null
  expires_at: string | null
  participants: PostMatchRatingParticipant[]
}

export interface PostMatchRatingInput {
  rated_id: string
  score: number
}

export interface HiddenRatingMemberRow {
  id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  preferred_position: string | null
  hidden_rating: number | null
  match_count: number
  admin_rating_count: number
  player_rating_count: number
  rating_count: number
  first_match_at: string | null
  last_match_at: string | null
}

/** 当前账号在指定活动的赛后匿名评分资格与候选人。 */
export async function getPostMatchRatingForm(activityId: string): Promise<PostMatchRatingForm | null> {
  const {data, error} = await supabase.rpc('get_post_match_rating_form', {p_activity_id: activityId})
  if (error) {
    console.error('getPostMatchRatingForm failed:', error.message)
    return null
  }
  const row = data as Partial<PostMatchRatingForm> | null
  if (!row) return null
  return {
    eligible: !!row.eligible,
    submitted: !!row.submitted,
    should_prompt: !!row.should_prompt,
    reason: row.reason || null,
    expires_at: row.expires_at || null,
    participants: Array.isArray(row.participants) ? row.participants : []
  }
}

/** 一次性提交本场已选择的匿名评分；未选择项不写入。 */
export async function submitPostMatchRatings(activityId: string, ratings: PostMatchRatingInput[]): Promise<{ok: boolean; message: string}> {
  const {data, error} = await supabase.rpc('submit_post_match_ratings', {
    p_activity_id: activityId,
    p_ratings: ratings
  })
  if (error) {
    console.error('submitPostMatchRatings failed:', error.message)
    return {ok: false, message: error.message || '提交失败'}
  }
  const result = data as {ok?: boolean; message?: string} | null
  return {ok: !!result?.ok, message: result?.message || (result?.ok ? '匿名评分已提交' : '提交失败')}
}

/** 管理员隐藏分榜单：最近10场有评分比赛，单场按管理员70%/队员30%合成。 */
export async function getHiddenRatingMembers(): Promise<HiddenRatingMemberRow[]> {
  const {data, error} = await supabase.rpc('get_hidden_rating_members')
  if (error) {
    console.error('getHiddenRatingMembers failed:', error.message)
    return []
  }
  return ((data || []) as HiddenRatingMemberRow[]).map((row) => ({
    ...row,
    hidden_rating: row.hidden_rating == null ? null : Number(row.hidden_rating),
    match_count: Number(row.match_count),
    admin_rating_count: Number(row.admin_rating_count),
    player_rating_count: Number(row.player_rating_count),
    rating_count: Number(row.rating_count)
  }))
}

/* ---------------- MVP 榜 ---------------- */

export interface MvpRankRow {
  user_id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  position: string | null
  mvp_votes: number
}

/** MVP 榜（按赛季 + 赛制聚合得票数；不传赛制时跨赛制按球员合并） */
export async function getMvpRanking(seasonId: string, matchFormat?: '5' | '8' | '11'): Promise<MvpRankRow[]> {
  let q = supabase.from('mvp_ranking').select('*').eq('season_id', seasonId)
  if (matchFormat) q = q.eq('match_format', matchFormat)
  const {data, error} = await q
    .order('mvp_votes', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getMvpRanking failed:', error.message)
    return []
  }
  const rows = (data as MvpRankRow[]) || []
  // 视图按 (赛季, 赛制, 球员) 一行；全部赛制需跨赛制合并，否则同一球员重复出现
  if (matchFormat || rows.length === 0) return rows
  const merged = new Map<string, MvpRankRow>()
  for (const row of rows) {
    const prev = merged.get(row.user_id)
    if (prev) {
      prev.mvp_votes += row.mvp_votes
    } else {
      merged.set(row.user_id, {...row})
    }
  }
  return [...merged.values()].sort((a, b) => b.mvp_votes - a.mvp_votes)
}

/** 活动内全部战术（含作者昵称与球员棋子） */
export async function getTactics(activityId: string): Promise<Tactic[]> {
  const {data, error} = await supabase
    .from('tactics')
    .select('id, activity_id, author_id, target_user_id, team, view_mode, lines, players, note, image_url, confirmed, confirmed_at, created_at, author:profiles!tactics_author_id_fkey(nickname)')
    .eq('activity_id', activityId)
    .order('created_at', {ascending: false})
    .limit(200)
  if (error) {
    console.error('getTactics failed:', error.message)
    return []
  }
  return (data as unknown as Tactic[]) || []
}

/** 创建战术指导（支持多选指导对象，为每个目标各插入一条记录） */
export async function createTactic(payload: {
  activity_id: string
  target_user_ids: string[]
  team: string
  view_mode: 'half' | 'full'
  lines: TacticLine[]
  players?: TacticPlayer[]
  note: string
  image_url?: string | null
}): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId || payload.target_user_ids.length === 0) return false
  const rows = payload.target_user_ids.map((uid) => ({
    activity_id: payload.activity_id,
    author_id: userId,
    target_user_id: uid,
    team: payload.team,
    view_mode: payload.view_mode,
    lines: payload.lines,
    players: payload.players || [],
    note: payload.note,
    image_url: payload.image_url || null
  }))
  const {error} = await supabase.from('tactics').insert(rows)
  if (error) {
    console.error('createTactic failed:', error.message)
    return false
  }
  return true
}

/** 我收到的全部战术（跨活动，含活动标题，用于「我的-战术管理」队员视角） */
export async function getMyTacticsAll(): Promise<TacticWithActivity[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data, error} = await supabase
    .from('tactics')
    .select('id, activity_id, author_id, target_user_id, team, view_mode, lines, players, note, image_url, confirmed, confirmed_at, created_at, author:profiles!tactics_author_id_fkey(nickname), activities(title, activity_time)')
    .eq('target_user_id', userId)
    .order('created_at', {ascending: false})
    .limit(300)
  if (error) {
    console.error('getMyTacticsAll failed:', error.message)
    return []
  }
  return (data as unknown as TacticWithActivity[]) || []
}

/** 我下发的全部战术（跨活动，含活动标题与目标队员，用于「我的-战术管理」教练视角） */
export async function getTacticsByMe(): Promise<TacticWithActivity[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data, error} = await supabase
    .from('tactics')
    .select('id, activity_id, author_id, target_user_id, team, view_mode, lines, players, note, image_url, confirmed, confirmed_at, created_at, author:profiles!tactics_author_id_fkey(nickname), target:profiles!tactics_target_user_id_fkey(nickname), activities(title, activity_time)')
    .eq('author_id', userId)
    .order('created_at', {ascending: false})
    .limit(300)
  if (error) {
    console.error('getTacticsByMe failed:', error.message)
    return []
  }
  return (data as unknown as TacticWithActivity[]) || []
}

/** 我的战术模板列表 */
export async function getMyTacticTemplates(): Promise<TacticTemplate[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []
  const {data, error} = await supabase
    .from('tactic_templates')
    .select('id, owner_id, name, team, view_mode, lines, players, is_public, created_at')
    .eq('owner_id', userId)
    .order('created_at', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getMyTacticTemplates failed:', error.message)
    return []
  }
  return (data as unknown as TacticTemplate[]) || []
}

/** 收藏当前绘制为战术模板 */
export async function createTacticTemplate(payload: {
  name: string
  team: string
  view_mode: 'half' | 'full'
  lines: TacticLine[]
  players?: TacticPlayer[]
}): Promise<string | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  const {data, error} = await supabase
    .from('tactic_templates')
    .insert({
      owner_id: userId,
      name: payload.name,
      team: payload.team,
      view_mode: payload.view_mode,
      lines: payload.lines,
      players: payload.players || []
    })
    .select('id')
    .single()
  if (error) {
    console.error('createTacticTemplate failed:', error.message)
    return null
  }
  return (data as {id: string} | null)?.id || null
}

/** 删除战术模板 */
export async function deleteTacticTemplate(templateId: string): Promise<boolean> {
  const {error} = await supabase.from('tactic_templates').delete().eq('id', templateId)
  if (error) {
    console.error('deleteTacticTemplate failed:', error.message)
    return false
  }
  return true
}

/** 重命名战术模板 */
export async function renameTacticTemplate(templateId: string, name: string): Promise<boolean> {
  const {error} = await supabase.from('tactic_templates').update({name}).eq('id', templateId)
  if (error) {
    console.error('renameTacticTemplate failed:', error.message)
    return false
  }
  return true
}

/** 统计我待确认的战术数量（用于我的页红点） */
export async function getPendingTacticCount(): Promise<number> {
  const userId = await getCurrentUserId()
  if (!userId) return 0
  const {count, error} = await supabase
    .from('tactics')
    .select('*', {count: 'exact', head: true})
    .eq('target_user_id', userId)
    .eq('confirmed', false)
  if (error) {
    console.error('getPendingTacticCount failed:', error.message)
    return 0
  }
  return count || 0
}

/** 删除战术（作者） */
export async function deleteTactic(tacticId: string): Promise<boolean> {
  const {error} = await supabase.from('tactics').delete().eq('id', tacticId)
  if (error) {
    console.error('deleteTactic failed:', error.message)
    return false
  }
  return true
}

/** 队员确认收到战术 */
export async function confirmTactic(tacticId: string): Promise<boolean> {
  const {error} = await supabase
    .from('tactics')
    .update({confirmed: true, confirmed_at: new Date().toISOString()})
    .eq('id', tacticId)
  if (error) {
    console.error('confirmTactic failed:', error.message)
    return false
  }
  return true
}

/** 获取某条战术的反馈列表（队员提交、队长查阅） */
export async function getTacticFeedback(tacticId: string): Promise<TacticFeedback[]> {
  const {data, error} = await supabase
    .from('tactic_feedback')
    .select('id, tactic_id, user_id, content, image_url, created_at, user:profiles!tactic_feedback_user_id_fkey(nickname)')
    .eq('tactic_id', tacticId)
    .order('created_at', {ascending: false})
    .limit(100)
  if (error) {
    console.error('getTacticFeedback failed:', error.message)
    return []
  }
  return (data as unknown as TacticFeedback[]) || []
}

/** 批量统计一批战术各自的反馈条数（教练端角标展示） */
export async function getTacticFeedbackCounts(tacticIds: string[]): Promise<Record<string, number>> {
  if (tacticIds.length === 0) return {}
  const {data, error} = await supabase
    .from('tactic_feedback')
    .select('tactic_id')
    .in('tactic_id', tacticIds)
    .limit(1000)
  if (error) {
    console.error('getTacticFeedbackCounts failed:', error.message)
    return {}
  }
  const counts: Record<string, number> = {}
  for (const row of (data || []) as {tactic_id: string}[]) {
    counts[row.tactic_id] = (counts[row.tactic_id] || 0) + 1
  }
  return counts
}

/** 队员提交战术反馈（文字 + 可选图片） */
export async function addTacticFeedback(payload: {
  tactic_id: string
  content: string
  image_url?: string | null
}): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId || !payload.content.trim()) return false
  const {error} = await supabase.from('tactic_feedback').insert({
    tactic_id: payload.tactic_id,
    user_id: userId,
    content: payload.content.trim(),
    image_url: payload.image_url || null
  })
  if (error) {
    console.error('addTacticFeedback failed:', error.message)
    return false
  }
  return true
}

/* ---------------- 赛后总结 ---------------- */

/** 获取某场活动的赛后总结 */
export async function getMatchSummary(activityId: string): Promise<MatchSummary | null> {
  const {data, error} = await supabase
    .from('match_summaries')
    .select('*, author:profiles!match_summaries_author_id_fkey(nickname)')
    .eq('activity_id', activityId)
    .order('updated_at', {ascending: false})
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('getMatchSummary failed:', error.message)
    return null
  }
  return (data as MatchSummary) || null
}

/** 保存（创建/更新）赛后总结（管理员） */
export async function saveMatchSummary(activityId: string, content: string): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false
  const {error} = await supabase.from('match_summaries').upsert(
    {
      activity_id: activityId,
      author_id: userId,
      content,
      updated_at: new Date().toISOString()
    },
    {onConflict: 'activity_id'}
  )
  if (error) {
    console.error('saveMatchSummary failed:', error.message)
    return false
  }
  return true
}

/* ---------------- 赛后投票（MVP / 最佳防守） ---------------- */

/** 获取某场活动的投票聚合结果 */
export async function getMatchVotes(activityId: string): Promise<{mvp: MatchVoteRow[]; defender: MatchVoteRow[]}> {
  const {data, error} = await supabase
    .from('match_votes')
    .select('candidate_id, kind')
    .eq('activity_id', activityId)
  if (error || !data) {
    console.error('getMatchVotes failed:', error?.message)
    return {mvp: [], defender: []}
  }
  const counts: Record<string, Record<string, number>> = {mvp: {}, defender: {}}
  for (const row of data as {candidate_id: string; kind: string}[]) {
    counts[row.kind][row.candidate_id] = (counts[row.kind][row.candidate_id] || 0) + 1
  }
  const candidateIds = [...new Set([...Object.keys(counts.mvp), ...Object.keys(counts.defender)])]
  const profiles = candidateIds.length
    ? (
        await supabase
          .from('profiles')
          .select('id,nickname,avatar_url,jersey_number')
          .in('id', candidateIds)
      ).data ?? []
    : []
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  const toRows = (map: Record<string, number>): MatchVoteRow[] =>
    Object.entries(map)
      .map(([cid, votes]) => {
        const p = byId.get(cid)
        return {candidate_id: cid, nickname: p?.nickname ?? null, avatar_url: p?.avatar_url ?? null, jersey_number: p?.jersey_number ?? null, votes}
      })
      .sort((a, b) => b.votes - a.votes)
  return {mvp: toRows(counts.mvp), defender: toRows(counts.defender)}
}

/** 我在某场活动的投票记录 */
export async function getMyMatchVotes(activityId: string): Promise<{mvp: string | null; defender: string | null}> {
  const userId = await getCurrentUserId()
  if (!userId) return {mvp: null, defender: null}
  const {data, error} = await supabase
    .from('match_votes')
    .select('candidate_id, kind')
    .eq('activity_id', activityId)
    .eq('voter_id', userId)
  if (error || !data) return {mvp: null, defender: null}
  const rows = data as {candidate_id: string; kind: string}[]
  return {
    mvp: rows.find((r) => r.kind === 'mvp')?.candidate_id ?? null,
    defender: rows.find((r) => r.kind === 'defender')?.candidate_id ?? null
  }
}

/** 投出赛后一票（仅报名队员，不可投自己） */
export async function castMatchVote(
  activityId: string,
  candidateId: string,
  kind: MatchVoteKind
): Promise<{ok: boolean; message?: string}> {
  const userId = await getCurrentUserId()
  if (!userId) return {ok: false, message: '请先登录'}
  if (candidateId === userId) return {ok: false, message: '不能投给自己'}
  // 校验是否已报名
  const {data: reg} = await supabase
    .from('registrations')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (!reg) return {ok: false, message: '仅报名队员可参与赛后投票'}
  // 已取消 / 12 小时截止校验
  const {data: act} = await supabase.from('activities').select('end_time, activity_time, cancelled').eq('id', activityId).maybeSingle()
  if (act?.cancelled) return {ok: false, message: '活动已取消，无法投票'}
  if (act && new Date(act.end_time || act.activity_time).getTime() + 12 * 3600 * 1000 <= Date.now()) {
    return {ok: false, message: '投票已截止，系统已结算不可修改'}
  }
  const {error} = await supabase.from('match_votes').upsert(
    {activity_id: activityId, voter_id: userId, candidate_id: candidateId, kind},
    {onConflict: 'activity_id,voter_id,kind'}
  )
  if (error) {
    console.error('castMatchVote failed:', error.message)
    return {ok: false, message: '投票失败'}
  }
  return {ok: true}
}

/** 获取当前收款码设置（公开可读，未设置返回 null） */
export async function getPaymentQr(): Promise<{url: string; owner: string} | null> {
  const {data, error} = await supabase.from('app_settings').select('value').eq('key', 'payment_qr').maybeSingle()
  if (error) {
    console.error('getPaymentQr failed:', error.message)
    return null
  }
  const v = (data?.value ?? null) as {url?: string; owner?: string} | null
  if (!v?.url) return null
  return {url: v.url, owner: v.owner || ''}
}

/** 保存自定义收款码（仅管理员） */
export async function setPaymentQr(url: string, owner: string): Promise<{ok: boolean; message?: string}> {
  const {data, error} = await supabase.rpc('set_payment_qr', {p_url: url, p_owner: owner})
  if (error) {
    console.error('setPaymentQr failed:', error.message)
    return {ok: false, message: '保存失败，请重试'}
  }
  const res = (data ?? {}) as {ok?: boolean; message?: string}
  return {ok: !!res.ok, message: res.message || (res.ok ? '保存成功' : '保存失败')}
}


/* ---------------- 群相册 ---------------- */

export async function getTeamAlbums(): Promise<TeamAlbum[]> {
  const {data, error} = await supabase.rpc('get_team_albums')
  if (error) {
    console.error('getTeamAlbums failed:', error.message)
    throw new Error(error.message)
  }
  return Array.isArray(data) ? (data as TeamAlbum[]) : []
}

export async function getTeamAlbumDetail(id: string): Promise<TeamAlbumBase | null> {
  const {data, error} = await supabase
    .from('team_albums')
    .select('id, name, description, created_by, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('getTeamAlbumDetail failed:', error.message)
    throw new Error(error.message)
  }
  return (data as TeamAlbumBase) ?? null
}

export async function createTeamAlbum(name: string, description: string | null): Promise<boolean> {
  const {error} = await supabase.from('team_albums').insert({name, description: description || null})
  if (error) {
    console.error('createTeamAlbum failed:', error.message)
    return false
  }
  return true
}

export async function updateTeamAlbum(id: string, name: string, description: string | null): Promise<boolean> {
  const {error} = await supabase
    .from('team_albums')
    .update({name, description: description || null})
    .eq('id', id)
  if (error) {
    console.error('updateTeamAlbum failed:', error.message)
    return false
  }
  return true
}

export async function getAlbumPhotos(albumId: string): Promise<TeamPhoto[]> {
  const {data, error} = await supabase
    .from('team_photos')
    .select('id, album_id, picui_key, url, thumbnail_url, origin_name, width, height, size_kb, uploaded_by, uploader_name, created_at')
    .eq('album_id', albumId)
    .order('created_at', {ascending: false})
    .limit(500)
  if (error) {
    console.error('getAlbumPhotos failed:', error.message)
    return []
  }
  return data ?? []
}

/** 调用 picui Edge Function（图床管理动作），失败抛出中文错误 */
async function invokePicui(body: Record<string, unknown>): Promise<any> {
  const {data, error} = await supabase.functions.invoke('picui', {body})
  if (error) {
    let msg = error.message || '操作失败'
    try {
      const text = await (error as any).context?.text?.()
      const parsed = text ? JSON.parse(text) : null
      if (parsed?.error) msg = String(parsed.error)
    } catch {
      /* 保留默认提示 */
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function getPicuiStatus(): Promise<PicuiStatus | null> {
  try {
    return (await invokePicui({action: 'status'})) as PicuiStatus
  } catch (e) {
    console.error('getPicuiStatus failed:', (e as Error).message)
    return null
  }
}

export async function savePicuiToken(token: string): Promise<PicuiProfile> {
  const data = await invokePicui({action: 'save-token', token})
  return data.profile as PicuiProfile
}

export async function deleteAlbumPhoto(photoId: string): Promise<void> {
  await invokePicui({action: 'delete-photo', photoId})
}

export async function deleteTeamAlbum(albumId: string): Promise<void> {
  await invokePicui({action: 'delete-album', albumId})
}

/** 上传单张照片至 picui 图床（base64 经 picui-upload Edge Function 中转） */
export async function uploadAlbumPhoto(params: {
  base64: string
  ext: string
  contentType: string
  albumId: string
  width?: number
  height?: number
}): Promise<TeamPhoto> {
  const {data, error} = await supabase.functions.invoke('picui-upload', {
    body: {
      base64: params.base64,
      ext: params.ext,
      contentType: params.contentType,
      albumId: params.albumId,
      width: params.width || 0,
      height: params.height || 0
    }
  })
  if (error) {
    let msg = error.message || '上传失败'
    try {
      const text = await (error as any).context?.text?.()
      const parsed = text ? JSON.parse(text) : null
      if (parsed?.error) msg = String(parsed.error)
    } catch {
      /* 保留默认提示 */
    }
    throw new Error(msg)
  }
  if (!data?.photo) throw new Error('上传失败')
  return data.photo as TeamPhoto
}
