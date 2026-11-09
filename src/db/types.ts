/** 数据库表结构类型（与 migrations 严格对应） */

export type UserRole = 'user' | 'admin'

/** profiles 表 */
export interface Profile {
  id: string
  username: string | null
  email: string | null
  phone: string | null
  role: UserRole
  openid: string | null
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  age: number | null
  preferred_position: string | null
  secondary_position: string | null
  preferred_foot: string
  foot_skill: number
  weak_foot_skill: number
  traits: string[]
  title: string | null
  /** 以下六维均为“已保存基础值 + 成长投入”的展示投影 */
  ab_shooting: number
  ab_passing: number
  ab_dribbling: number
  ab_defending: number
  ab_pace: number
  ab_stamina: number
  activity: number
  home_team: string | null
  exp: number
  free_points: number
  created_at: string
  updated_at: string
  /** 已装备技能（getSquad 附带完整 skill 信息） */
  member_skills?: MemberSkill[] | null
  /** 已装备装备（getSquad / getSquadRoster / getSquadMember 附带 bonuses） */
  member_equipment?: {id: string; equipped: boolean; equipment: {bonuses: Record<string, number>} | null}[] | null
}

/** 六维能力值映射（固定且完整的六个键） */
export interface AbilityValues {
  ab_pace: number
  ab_shooting: number
  ab_passing: number
  ab_dribbling: number
  ab_defending: number
  ab_stamina: number
}

/** 当前用户的权威基础值、成长分配、动态上限与预算 */
export interface AbilityAllocation {
  base: AbilityValues
  /** 在自定义基础值之上投入的成长点 */
  allocated: AbilityValues
  caps: AbilityValues
  budget: number
  free_points: number
  appearances: number
  /** 仅用于展示；位置不参与上限或预算计算 */
  position: string | null
}

/** seasons 表 */
export interface Season {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

/** activities 表 */
export interface Activity {
  id: string
  season_id: string
  title: string
  activity_time: string
  end_time: string | null
  location: string
  max_players: number
  match_format: '5' | '8' | '11'
  match_type: 'internal' | 'external'
  /** 取消报名截止：hours = 开赛前 N 小时内不可取消；sameday = 每天 N 点后至活动开始不可取消 */
  cancel_cutoff_mode: 'hours' | 'sameday'
  /** 截止值：hours 模式的小时数（1-72）或 sameday 模式的钟点（0-23） */
  cancel_cutoff_value: number
  note: string | null
  notice: string | null
  coach_slots: number
  captain_slots: number
  /** 内战分组数（2/3/4） */
  team_groups: number
  /** 是否已结算奖励 */
  settled: boolean
  /** 是否已取消（取消的活动永不结算、不计出场） */
  cancelled: boolean
  /** 是否开放赛后匿名表现评分 */
  post_match_rating_enabled: boolean
  /** 最近一次导出收款海报时计算的人均费用（元） */
  per_person_fee: number | null
  created_by: string | null
  created_at: string
}

/** 活动列表行（含报名记录席位与携带人数，用于前端区分队员/教练计数） */
export interface ActivityWithCount extends Activity {
  regs: {seat_role: string; guest_count: number}[]
}

/** 报名嘉宾（随报名人带入的人，含姓名/位置/分队） */
export interface RegistrationGuest {
  id: string
  registration_id: string
  activity_id: string
  seq: number
  name: string | null
  position: string | null
  team: string | null
  created_at: string
  owner_nickname?: string | null
}

/** 报名记录（含队员资料） */
export interface Registration {
  id: string
  activity_id: string
  user_id: string
  seat_role: 'player' | 'coach' | 'captain'
  team: string | null
  assigned_position: string | null
  status: 'confirmed' | 'waitlist'
  waitlist_seq: number
  guest_count: number
  created_at: string
  guests?: RegistrationGuest[]
  profiles?:
    | {
        id: string
        nickname: string | null
        avatar_url: string | null
        jersey_number: number | null
        preferred_position: string | null
        secondary_position: string | null
        title: string | null
        appearances: number
      }
    | null
}

/** 赛后个人数据 */
export interface MatchStats {
  id: string
  activity_id: string
  user_id: string
  goals: number
  assists: number
  created_at: string
  updated_at: string
}

/** season_stats 视图行 */
export interface SeasonStatsRow {
  season_id: string
  user_id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  /** 榜单位置（视图内为 profiles.preferred_position 的别名） */
  position: string | null
  appearances: number
  goals: number
  assists: number
}

/** 首发阵型 */

/** 战术板点位（支持自由坐标 x, y 百分比 0-100、自定义号码与队员分配） */
export interface LineupPosition {
  id?: string
  slot?: number
  number?: string
  label?: string
  x?: number
  y?: number
  user_id?: string | null
}

/** 首发阵型 */
export interface Lineup {
  id: string
  activity_id: string
  formation: string
  positions: LineupPosition[]
  updated_by: string | null
  updated_at: string
}

/** 活动评论（支持盖楼回复与点赞） */
export interface ActivityComment {
  id: string
  activity_id: string
  user_id: string
  content: string
  parent_id: string | null
  reply_to_user_id: string | null
  created_at: string
  profiles?: {nickname: string | null; avatar_url: string | null} | null
  reply_to?: {nickname: string | null} | null
  likes?: {count: number}[]
}

/** 队内事务投票 */
export interface Poll {
  id: string
  season_id: string | null
  title: string
  created_by: string
  is_closed: boolean
  created_at: string
  profiles?: {nickname: string | null} | null
}

export interface PollOption {
  id: string
  poll_id: string
  label: string
  sort_order: number
}

export interface PollWithMeta extends Poll {
  options: {id: string; label: string; votes: number}[]
  my_option_id: string | null
}

/** 最佳防守球员投票 */
export interface DefenderVoteRow {
  candidate_id: string
  points: number
  profiles?: {nickname: string | null; avatar_url: string | null; jersey_number: number | null} | null
}

/** member_growth 视图行（等级/活跃度/火力值） */
export interface MemberGrowth {
  id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  preferred_position: string | null
  role: UserRole
  activity: number
  level: number
  appearances: number
  goals: number
  assists: number
  def_votes: number
  firepower: number
}

/** FIFA 特性/技能库 */
export interface SkillCatalog {
  id: string
  kind: 'trait' | 'skill'
  name: string
  description: string
  /** 历史字段：原活跃度定价（仅展示参考，实际消耗 cost_points 能力点） */
  cost: number
  /** 解锁/升级消耗的能力点 */
  cost_points: number
  /** 可升级的最高等级（加成 = bonus_value × level） */
  max_level: number
  sort_order: number
  /** 星级：gold=金、silver=银、bronze=铜（FIFA PlayStyles） */
  rarity: 'gold' | 'silver' | 'bronze'
  bonus_key: string | null
  bonus_value: number
}

/** 队长后台配置的成长数值 */
export interface GrowthConfig {
  id: number
  exp_per_level: number
  exp_per_match: number
  activity_per_match: number
  /** 每升一级发放的自由属性点 */
  points_per_level: number
  /** 单场 MVP 额外奖励 */
  mvp_exp: number
  mvp_activity: number
  /** 单场最佳防守额外奖励 */
  defender_exp: number
  defender_activity: number
  /** 每进1球额外奖励 */
  goal_exp: number
  goal_activity: number
  /** 每助攻1次额外奖励 */
  assist_exp: number
  assist_activity: number
  /** 蹲坑成团达标人数 */
  squat_target: number
  updated_by: string | null
  updated_at: string
}

/** 蹲坑意愿记录（含参与者与达标信息，由 RPC 返回） */
export interface KickRequest {
  id: string
  creator_id: string
  preferred_time: string
  preferred_location: string
  note: string
  status: 'open' | 'closed' | 'converted'
  created_at: string
  creator_nickname: string | null
  creator_avatar: string | null
  participant_count: number
  target: number
  participants: {user_id: string; nickname: string | null; avatar_url: string | null}[]
}

/** 队员已解锁/装备的技能 */
export interface MemberSkill {
  id: string
  user_id: string
  skill_id: string
  equipped: boolean
  /** 当前等级（Lv1 起，加成 = bonus_value × level） */
  level: number
  unlocked_at: string
  skill?: SkillCatalog | null
}

/** 装备槽位 */
export type EquipmentSlot = 'boots' | 'shinpad' | 'gloves' | 'jersey' | 'socks' | 'kneepad' | 'wristband' | 'supplement'

/** 装备目录定义 */
export interface EquipmentCatalog {
  id: string
  name: string
  slot: EquipmentSlot
  rarity: 'bronze' | 'silver' | 'gold' | 'legend'
  bonuses: Record<string, number>
  effect: string
  effect_desc: string
  icon: string
  cost: number
  sort_order: number
  created_at: string
}

/** 队员已拥有/装备的装备 */
export interface MemberEquipment {
  id: string
  user_id: string
  equipment_id: string
  equipped: boolean
  unlocked_at: string
  equipment?: EquipmentCatalog | null
}

/** 战术线（传球/跑位/回防） */
export interface TacticLine {
  kind: 'pass' | 'run' | 'defend' | 'flag' | 'opp'
  points: {x: number; y: number}[]
  order?: number
  /** 单条战术线的备注说明 */
  note?: string
  /** 线条形状：直线或弧线 */
  curve?: 'straight' | 'arc'
}

/** 战术球员棋子（教练放置，随战术保存） */
export interface TacticPlayer {
  id: string
  /** 0-100 百分比坐标 */
  x: number
  y: number
  label: string
  avatar_url?: string | null
}

/** 一对一战术指导 */
export interface Tactic {
  id: string
  activity_id: string
  author_id: string
  target_user_id: string
  team: string
  view_mode: 'half' | 'full'
  lines: TacticLine[]
  /** 教练放置的球员棋子（0-100 百分比坐标） */
  players?: TacticPlayer[]
  note: string
  /** 战术图片附件（如纸质草图照片） */
  image_url?: string | null
  confirmed: boolean
  confirmed_at: string | null
  created_at: string
  author?: {nickname: string | null} | null
}

/** 队员对战术的反馈（文字 + 图片） */
export interface TacticFeedback {
  id: string
  tactic_id: string
  user_id: string
  content: string
  image_url?: string | null
  created_at: string
  /** 反馈人昵称 */
  user?: {nickname: string | null} | null
}

/** 战术（含活动信息，用于跨活动的战术管理页） */
export interface TacticWithActivity extends Tactic {
  activities?: {title: string | null; activity_time: string | null} | null
  /** 目标队员昵称（我下发的视角） */
  target?: {nickname: string | null} | null
}

/** 战术模板（收藏后下次一键导入） */
export interface TacticTemplate {
  id: string
  owner_id: string
  name: string
  team: string
  view_mode: 'half' | 'full'
  lines: TacticLine[]
  players?: TacticPlayer[]
  is_public: boolean
  created_at: string
}

/** 赛后总结 */
export interface MatchSummary {
  id: string
  activity_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  author?: {nickname: string | null} | null
}

/** 赛后投票类型 */
export type MatchVoteKind = 'mvp' | 'defender'

/** 赛后投票聚合行 */
export interface MatchVoteRow {
  candidate_id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  votes: number
}

/** ---------------- 群相册 ---------------- */

/** 群相册列表项（RPC 返回，含统计与封面） */
export interface TeamAlbum {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  creator_name: string
  photo_count: number
  cover_url: string | null
}

/** 相册基础信息 */
export interface TeamAlbumBase {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
}

/** 群相册照片（文件存 picui 图床） */
export interface TeamPhoto {
  id: string
  album_id: string
  picui_key: string
  url: string
  thumbnail_url: string | null
  origin_name: string | null
  width: number | null
  height: number | null
  size_kb: number | null
  uploaded_by: string
  uploader_name: string | null
  created_at: string
}

/** picui 图床账号信息（脱敏，不含 Token） */
export interface PicuiProfile {
  username: string
  name: string | null
  capacity: number
  size: number
  image_num: number
  album_num: number
}

/** picui 图床配置状态 */
export interface PicuiStatus {
  configured: boolean
  valid?: boolean
  message?: string
  profile?: PicuiProfile | null
  updated_at?: string
}
