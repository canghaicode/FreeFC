/** 场上位置选项 */
export const POSITIONS = ['门将', '后卫', '中场', '前锋'] as const
export type Position = (typeof POSITIONS)[number]

/** 标准位置代码（对外展示用） */
export const POSITION_SHORT: Record<string, string> = {
  门将: 'GK',
  后卫: 'CB',
  中场: 'CM',
  前锋: 'ST'
}

/** 位置代码 → 中文（筛选/输入兼容） */
export const CODE_TO_POSITION: Record<string, string> = {
  GK: '门将',
  CB: '后卫',
  CM: '中场',
  ST: '前锋'
}

/** 任意位置值（中文或代码）→ 中文显示（前锋/中场/后卫/门将），无位置显示「未定」 */
export function positionShort(pos?: string | null): string {
  if (!pos) return '未定'
  if (POSITION_SHORT[pos]) return pos
  const cn = CODE_TO_POSITION[pos.toUpperCase()]
  if (cn) return cn
  return pos
}

/** 评分预设标签 */
export interface RatingTag {
  label: string
  kind: 'positive' | 'negative' | 'fun'
}

export const RATING_TAGS: RatingTag[] = [
  // 正面
  {label: '大腿', kind: 'positive'},
  {label: '稳如泰山', kind: 'positive'},
  {label: '跑不死', kind: 'positive'},
  {label: '手术刀传球', kind: 'positive'},
  {label: '重炮手', kind: 'positive'},
  {label: '攻防一体', kind: 'positive'},
  {label: '球商在线', kind: 'positive'},
  // 负面
  {label: '快乐足球', kind: 'negative'},
  {label: '隐身人', kind: 'negative'},
  {label: '散步帝', kind: 'negative'},
  {label: '黄油手', kind: 'negative'},
  {label: '眼神防守', kind: 'negative'},
  {label: '独狼', kind: 'negative'},
  // 有趣
  {label: '更衣室DJ', kind: 'fun'},
  {label: '战术鬼才', kind: 'fun'},
  {label: '装备最贵', kind: 'fun'},
  {label: '队宠', kind: 'fun'},
  {label: '喝水大师', kind: 'fun'},
  {label: '自带裁判', kind: 'fun'}
]

export const RATING_TAG_KINDS: {key: RatingTag['kind']; label: string; cls: string}[] = [
  {key: 'positive', label: '正面', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'},
  {key: 'negative', label: '负面', cls: 'bg-rose-500/15 text-rose-600 border-rose-500/30'},
  {key: 'fun', label: '有趣', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30'}
]

/** 位置对应的图标 */
export const POSITION_ICONS: Record<string, string> = {
  门将: 'i-mdi-soccer',
  后卫: 'i-mdi-shield-account',
  中场: 'i-mdi-transit-connection-variant',
  前锋: 'i-mdi-target'
}

/** FUT 经典位置英文缩写映射 */
export const POSITION_FUT_CODES: Record<string, string> = {
  门将: 'GK',
  后卫: 'CB',
  中场: 'CM',
  前锋: 'ST'
}

export function positionToFutCode(pos?: string | null): string {
  if (!pos) return 'SUB'
  for (const [k, v] of Object.entries(POSITION_FUT_CODES)) {
    if (pos.includes(k)) return v
  }
  return pos.slice(0, 3).toUpperCase()
}

/** 取有效能力值：管理员评定优先，其次队员自评 */
/** 惯用脚选项 */
export const FEET = [
  {value: 'left', label: '左脚'},
  {value: 'right', label: '右脚'},
  {value: 'both', label: '双足'}
] as const

export type FootValue = (typeof FEET)[number]['value']

/** 惯用脚展示名 */
export function footLabel(v?: string): string {
  return FEET.find((f) => f.value === v)?.label ?? '右脚'
}

/** 正面特质库（多选，展示在球星卡，绿色标签） */
export const POSITIVE_TRAITS = [
  '双足',
  '铁人',
  '重炮手',
  '手术刀',
  '永动机',
  '空霸',
  '领袖',
  '冷静'
] as const

/** 负面特质库（多选，展示在球星卡，红色标签） */
export const NEGATIVE_TRAITS = [
  '双逆足',
  '玻璃人',
  '散步帝',
  '软脚虾',
  '黄油手',
  '越位狂魔',
  '隐身人',
  '独狼'
] as const

/** 全部特质（正+负），用于存储校验 */
export const ALL_TRAITS = [...POSITIVE_TRAITS, ...NEGATIVE_TRAITS] as const

/** 是否为负面特质 */
export function isNegativeTrait(t: string): boolean {
  return (NEGATIVE_TRAITS as readonly string[]).includes(t)
}

/** 荣誉徽章（赛季榜单 → 数据榜与报名列表亮标） */
export interface HonorBadge {
  key: string
  label: string
  icon: string
  cls: string
}

export const HONOR_BADGES: Record<string, HonorBadge> = {
  golden_boot: {key: 'golden_boot', label: '金靴', icon: 'i-mdi-shoe-print', cls: 'bg-amber-400/20 text-amber-500'},
  silver_boot: {key: 'silver_boot', label: '银靴', icon: 'i-mdi-shoe-print', cls: 'bg-slate-300/25 text-slate-400'},
  bronze_boot: {key: 'bronze_boot', label: '铜靴', icon: 'i-mdi-shoe-print', cls: 'bg-orange-400/20 text-orange-600'},
  assist_king: {key: 'assist_king', label: '助攻王', icon: 'i-mdi-handshake', cls: 'bg-sky-400/20 text-sky-400'},
  defense_wall: {key: 'defense_wall', label: '防守铁闸', icon: 'i-mdi-shield-star', cls: 'bg-emerald-400/20 text-emerald-500'},
  mvp: {key: 'mvp', label: 'MVP', icon: 'i-mdi-trophy-award', cls: 'bg-violet-400/20 text-violet-500'}
}

/** 可佩戴称号定义 */
export interface TitleDef {
  key: string
  label: string
  icon: string
  cls: string
  type: 'conditional' | 'free'
  desc?: string
}

/** 条件称号（需达成赛季榜单/评选条件解锁） */
export const CONDITIONAL_TITLES: TitleDef[] = [
  {...HONOR_BADGES.golden_boot, type: 'conditional', desc: '赛季射手榜第1名'},
  {...HONOR_BADGES.silver_boot, type: 'conditional', desc: '赛季射手榜第2名'},
  {...HONOR_BADGES.bronze_boot, type: 'conditional', desc: '赛季射手榜第3名'},
  {...HONOR_BADGES.assist_king, type: 'conditional', desc: '赛季助攻榜第1名'},
  {...HONOR_BADGES.defense_wall, type: 'conditional', desc: '赛季防守榜第1名'},
  {...HONOR_BADGES.mvp, type: 'conditional', desc: '当选过单场MVP'}
]

/** 自由称号（无需条件，可自行佩戴） */
export const FREE_TITLES: TitleDef[] = [
  {key: 'newbie', label: '萌新', icon: 'i-mdi-sprout', cls: 'bg-emerald-400/20 text-emerald-500', type: 'free'},
  {key: 'boss', label: '大佬', icon: 'i-mdi-crown', cls: 'bg-amber-400/20 text-amber-500', type: 'free'},
  {key: 'audience', label: '国足观众', icon: 'i-mdi-television', cls: 'bg-red-400/20 text-red-500', type: 'free'},
  {key: 'veteran', label: '老司机', icon: 'i-mdi-car-sports', cls: 'bg-sky-400/20 text-sky-400', type: 'free'},
  {key: 'keyboard', label: '键盘侠', icon: 'i-mdi-keyboard', cls: 'bg-slate-400/20 text-slate-400', type: 'free'},
  {key: 'noob', label: '菜鸡', icon: 'i-mdi-emoticon-sick-outline', cls: 'bg-orange-400/20 text-orange-500', type: 'free'},
  {key: 'carry', label: '大腿', icon: 'i-mdi-arm-flex', cls: 'bg-purple-400/20 text-purple-500', type: 'free'},
  {key: 'jinx', label: '毒奶', icon: 'i-mdi-baby-bottle-outline', cls: 'bg-green-400/20 text-green-500', type: 'free'},
  {key: 'happy', label: '快乐足球', icon: 'i-mdi-emoticon-happy-outline', cls: 'bg-pink-400/20 text-pink-500', type: 'free'},
  {key: 'health', label: '养生足球', icon: 'i-mdi-leaf', cls: 'bg-teal-400/20 text-teal-500', type: 'free'},
  {key: 'beauty', label: '颜值担当', icon: 'i-mdi-star-face', cls: 'bg-rose-400/20 text-rose-500', type: 'free'},
  {key: 'commander', label: '球场指挥官', icon: 'i-mdi-whistle', cls: 'bg-indigo-400/20 text-indigo-500', type: 'free'},
  {key: 'waterboy', label: '饮水机管理员', icon: 'i-mdi-cup-water', cls: 'bg-cyan-400/20 text-cyan-500', type: 'free'},
  {key: 'offside', label: '越位狂魔', icon: 'i-mdi-run', cls: 'bg-yellow-400/20 text-yellow-600', type: 'free'},
  {key: 'walker', label: '散步帝', icon: 'i-mdi-walk', cls: 'bg-lime-400/20 text-lime-600', type: 'free'},
  {key: 'cannon', label: '重炮手', icon: 'i-mdi-rocket-launch', cls: 'bg-orange-500/20 text-orange-600', type: 'free'},
  {key: 'sweeper', label: '带刀后卫', icon: 'i-mdi-sword-cross', cls: 'bg-fuchsia-400/20 text-fuchsia-500', type: 'free'}
]

export const TITLES: TitleDef[] = [...CONDITIONAL_TITLES, ...FREE_TITLES]

/** 根据称号 key 获取定义 */
export function titleOf(key: string | null | undefined): TitleDef | undefined {
  if (!key) return undefined
  return TITLES.find((t) => t.key === key)
}

/** 判断称号是否为条件称号 */
export function isConditionalTitle(key: string): boolean {
  return CONDITIONAL_TITLES.some((t) => t.key === key)
}

/** 六维能力维度定义（球星卡雷达图） */
export const ABILITY_DIMENSIONS = [
  {key: 'ab_pace', label: '速度', icon: 'i-mdi-run-fast'},
  {key: 'ab_shooting', label: '射门', icon: 'i-mdi-target'},
  {key: 'ab_passing', label: '传球', icon: 'i-mdi-transit-connection-variant'},
  {key: 'ab_dribbling', label: '盘带', icon: 'i-mdi-shoe-print'},
  {key: 'ab_defending', label: '防守', icon: 'i-mdi-shield-account'},
  {key: 'ab_stamina', label: '体能', icon: 'i-mdi-heart-pulse'}
] as const

export type AbilityKey = (typeof ABILITY_DIMENSIONS)[number]['key']

/** 六维能力载体（Profile 或其子集） */
export interface AbilityCarrier {
  ab_pace?: number | null
  ab_shooting?: number | null
  ab_passing?: number | null
  ab_dribbling?: number | null
  ab_defending?: number | null
  ab_stamina?: number | null
}

/** 总评：六维任一有值时取已有维度的平均（四舍五入，FIFA 上限 99），否则 null */
/** 德转风格身价档位（万欧）：由综合能力值档位式映射 */
const MARKET_VALUE_TIERS: {min: number; label: string}[] = [
  {min: 95, label: '1.5亿欧'},
  {min: 90, label: '1亿欧'},
  {min: 85, label: '7000万欧'},
  {min: 80, label: '4000万欧'},
  {min: 75, label: '2500万欧'},
  {min: 70, label: '1500万欧'},
  {min: 65, label: '1000万欧'},
  {min: 60, label: '700万欧'},
  {min: 55, label: '500万欧'},
  {min: 50, label: '350万欧'},
  {min: 45, label: '250万欧'},
  {min: 0, label: '100万欧'}
]

/** 根据能力值综合自动评定德转风格身价（如"700万欧"），未录能力返回 '--' */
export function marketValueOf(p?: AbilityCarrier | null): string {
  const ovr = overallAbility(p)
  if (ovr === null) return '--'
  return (MARKET_VALUE_TIERS.find((t) => ovr >= t.min) || {label: '100万欧'}).label
}

export function overallAbility(p?: AbilityCarrier | null): number | null {
  if (!p) return null
  const values = ABILITY_DIMENSIONS.map((d) => p[d.key]).filter(
    (v): v is number => v !== null && v !== undefined
  )
  if (values.length === 0) return null
  return Math.min(99, Math.round(values.reduce((s, v) => s + v, 0) / values.length))
}

/** 格式化活动时间为「M月D日 周X HH:mm」 */
export function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 日期转 YYYY-MM-DD（本地时区） */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 时间转 HH:mm（本地时区） */
export function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 队费记录类别（已移除队费模块，占位防止误用） */

/** 赛制类型：5人制、8人制、11人制 */
export type MatchFormat = '5' | '8' | '11'

export interface MatchFormatConfig {
  key: MatchFormat
  name: string
  defaultMaxPlayers: number
  recommendedPlayers: number[]
  defaultFormation: string
  formations: Record<string, number[]>
}

/** 各赛制配置与经典阵型预设库 */
export const MATCH_FORMATS: Record<MatchFormat, MatchFormatConfig> = {
  '5': {
    key: '5',
    name: '5人制',
    defaultMaxPlayers: 10,
    recommendedPlayers: [8, 12, 15],
    defaultFormation: '1-2-1',
    formations: {
      '1-2-1': [1, 2, 1],
      '2-2': [2, 2],
      '2-1-1': [2, 1, 1],
      '1-1-2': [1, 1, 2]
    }
  },
  '8': {
    key: '8',
    name: '8人制',
    defaultMaxPlayers: 14,
    recommendedPlayers: [12, 16, 22],
    defaultFormation: '3-3-1',
    formations: {
      '3-3-1': [3, 3, 1],
      '3-2-2': [3, 2, 2],
      '2-3-2': [2, 3, 2],
      '2-4-1': [2, 4, 1]
    }
  },
  '11': {
    key: '11',
    name: '11人制',
    defaultMaxPlayers: 18,
    recommendedPlayers: [16, 18, 22],
    defaultFormation: '4-3-3',
    formations: {
      '4-3-3': [4, 3, 3],
      '4-2-3-1': [4, 2, 3, 1],
      '4-4-2': [4, 4, 2],
      '3-5-2': [3, 5, 2]
    }
  }
}

/** 所有赛制预设阵型的合并（保持向后兼容） */
export const FORMATIONS: Record<string, number[]> = {
  ...MATCH_FORMATS['11'].formations,
  ...MATCH_FORMATS['8'].formations,
  ...MATCH_FORMATS['5'].formations
}

/** 阵型点位根据行数自适应计算纵向与横向百分比坐标 (x: 0-100, y: 0-100) */
export function defaultSlotCoords(rows: number[], slot: number): {x: number; y: number; role: string; defaultNum: string} {
  // 槽位 0 固定为门将（球门前，底部）
  if (slot === 0) {
    return {x: 50, y: 88, role: '门将', defaultNum: 'GK'}
  }
  let idx = 1
  for (let r = 0; r < rows.length; r++) {
    const count = rows[r]
    // 门将在底部 y=88，后卫在下半场 (如 y=70)，中场在中间 (如 y=48)，前锋在顶部 (如 y=22)
    const y = rows.length === 1 ? 45 : 72 - (r * 52) / (rows.length - 1)
    let role = '中场'
    if (r === 0) role = '后卫'
    else if (r === rows.length - 1) role = '前锋'

    for (let c = 0; c < count; c++) {
      if (idx === slot) {
        const x = count === 1 ? 50 : 18 + (c * 64) / (count - 1)
        return {x, y, role, defaultNum: String(slot)}
      }
      idx++
    }
  }
  return {x: 50, y: 50, role: '队员', defaultNum: String(slot)}
}

/** 阵型下标 -> 阵型行内角色提示 */
export function formationSlotRole(formation: string, slot: number): string {
  const rows = FORMATIONS[formation] || [4, 3, 3]
  return defaultSlotCoords(rows, slot).role
}

/* ---------------- 球星卡品质等级（FIFA 风格） ---------------- */

export interface CardTier {
  key: 'legend' | 'gold' | 'silver' | 'bronze' | 'unset'
  name: string
  icon: string
  /** 徽章样式类（app.scss 中 tier-* 金属渐变） */
  badgeCls: string
  /** 左侧品质竖条样式类 */
  barCls: string
  /** 品质主题色（雷达图/描边等内联场景） */
  color: string
  /** 排序权重，越大越高贵 */
  rank: number
}

export const CARD_TIERS: Record<CardTier['key'], CardTier> = {
  legend: {
    key: 'legend', name: '传奇', icon: 'i-mdi-crown-outline',
    badgeCls: 'tier-legend', barCls: 'tier-bar-legend', color: '#C9A227', rank: 4
  },
  gold: {
    key: 'gold', name: '黄金', icon: 'i-mdi-star-four-points',
    badgeCls: 'tier-gold', barCls: 'tier-bar-gold', color: '#C9A227', rank: 3
  },
  silver: {
    key: 'silver', name: '白银', icon: 'i-mdi-shield-star-outline',
    badgeCls: 'tier-silver', barCls: 'tier-bar-silver', color: '#9DA3A8', rank: 2
  },
  bronze: {
    key: 'bronze', name: '青铜', icon: 'i-mdi-shield-outline',
    badgeCls: 'tier-bronze', barCls: 'tier-bar-bronze', color: '#8C6239', rank: 1
  },
  unset: {
    key: 'unset', name: '未评级', icon: 'i-mdi-help-circle-outline',
    badgeCls: 'tier-unset', barCls: 'tier-bar-unset', color: '#7A6A45', rank: 0
  }
}

/** 根据总评 OVR 判定卡片品质：青铜 <55 / 白银 55-61 / 黄金 62-69 / 传奇 ≥70 */
export function cardTier(ovr: number | null | undefined): CardTier {
  if (ovr === null || ovr === undefined) return CARD_TIERS.unset
  if (ovr >= 70) return CARD_TIERS.legend
  if (ovr >= 62) return CARD_TIERS.gold
  if (ovr >= 55) return CARD_TIERS.silver
  return CARD_TIERS.bronze
}

/* ---------------- 球星模板库（一键套用后可微调） ---------------- */

export interface StarTemplate {
  key: string
  name: string
  icon: string
  /** 适合位置 */
  position: string
  desc: string
  /** 每项 40..70 且六维合计 300，可直接作为自定义基础值 */
  abilities: Record<AbilityKey, number>
}

export const STAR_TEMPLATES: StarTemplate[] = [
  {
    key: 'winger', name: '速度型边锋', icon: 'i-mdi-run-fast', position: '边锋',
    desc: '风驰电掣，靠速度与盘带撕开边路',
    abilities: {ab_pace: 70, ab_shooting: 45, ab_passing: 45, ab_dribbling: 60, ab_defending: 40, ab_stamina: 40}
  },
  {
    key: 'striker', name: '禁区终结者', icon: 'i-mdi-target', position: '前锋',
    desc: '嗅觉敏锐，一击致命的射手',
    abilities: {ab_pace: 55, ab_shooting: 70, ab_passing: 40, ab_dribbling: 50, ab_defending: 40, ab_stamina: 45}
  },
  {
    key: 'playmaker', name: '组织核心', icon: 'i-mdi-compass-outline', position: '前腰',
    desc: '用传球掌控节奏的场上大脑',
    abilities: {ab_pace: 45, ab_shooting: 45, ab_passing: 70, ab_dribbling: 60, ab_defending: 40, ab_stamina: 40}
  },
  {
    key: 'b2b', name: '全能中场', icon: 'i-mdi-swap-horizontal', position: '中前卫',
    desc: '攻防全覆盖的Box-toBox发动机',
    abilities: {ab_pace: 50, ab_shooting: 45, ab_passing: 55, ab_dribbling: 45, ab_defending: 45, ab_stamina: 60}
  },
  {
    key: 'destroyer', name: '扫荡型后腰', icon: 'i-mdi-shield-account-outline', position: '后腰',
    desc: '中场绞肉机，拦截扫荡一绝',
    abilities: {ab_pace: 45, ab_shooting: 40, ab_passing: 50, ab_dribbling: 40, ab_defending: 70, ab_stamina: 55}
  },
  {
    key: 'rock', name: '铁血后卫', icon: 'i-mdi-wall', position: '中后卫',
    desc: '一夫当关，禁区内寸土不让',
    abilities: {ab_pace: 45, ab_shooting: 40, ab_passing: 45, ab_dribbling: 40, ab_defending: 70, ab_stamina: 60}
  },
  {
    key: 'keeper', name: '门神', icon: 'i-mdi-hand-back-right-outline', position: '门将',
    desc: '反应神速，球队最后一道防线',
    abilities: {ab_pace: 40, ab_shooting: 40, ab_passing: 55, ab_dribbling: 40, ab_defending: 70, ab_stamina: 55}
  },
  {
    key: 'legend10', name: '传奇十号', icon: 'i-mdi-crown', position: '前腰/前锋',
    desc: '传射俱佳的绿茵艺术家',
    abilities: {ab_pace: 50, ab_shooting: 50, ab_passing: 60, ab_dribbling: 60, ab_defending: 40, ab_stamina: 40}
  }
]

// ==================== 等级制度 ====================

/** 每次出勤获得的活跃度 */
export const ACTIVITY_PER_APPEARANCE = 100

export interface LevelDef {
  level: number
  name: string
  min: number
  max: number
  icon: string
  color: string
}

/** 等级阶梯（与 DB 视图 member_growth 的 level 计算保持一致） */
export const LEVELS: LevelDef[] = [
  {level: 1, name: '梯队新星', min: 0, max: 299, icon: 'i-mdi-seed-outline', color: 'text-emerald-500'},
  {level: 2, name: '轮换主力', min: 300, max: 699, icon: 'i-mdi-account-star-outline', color: 'text-sky-500'},
  {level: 3, name: '核心骨干', min: 700, max: 1499, icon: 'i-mdi-star-outline', color: 'text-violet-500'},
  {level: 4, name: '球队支柱', min: 1500, max: 2999, icon: 'i-mdi-shield-star-outline', color: 'text-amber-500'},
  {level: 5, name: '传奇名宿', min: 3000, max: Number.MAX_SAFE_INTEGER, icon: 'i-mdi-crown-outline', color: 'text-rose-500'}
]

/** 根据活跃度计算等级定义 */
export function levelFromActivity(activity: number): LevelDef {
  return LEVELS.find((l) => activity >= l.min && activity <= l.max) || LEVELS[0]
}

/** 距离下一级所需活跃度进度（0-100） */
export function levelProgress(activity: number): number {
  const def = levelFromActivity(activity)
  if (def.level >= 5) return 100
  const span = def.max - def.min + 1
  return Math.min(100, Math.round(((activity - def.min) / span) * 100))
}

// ==================== 主队选择 ====================

export interface HomeTeam {
  name: string
  short: string
  color: string
  text: string
  league: string
}

/** 主队分组顺序 */
export const HOME_LEAGUES = ['英超', '西甲', '意甲', '德甲', '法甲', '本队'] as const

/** 可选主队列表（五大联赛全部球队 + 本队） */
export const HOME_TEAMS: HomeTeam[] = [
  // 英超
  {name: '阿森纳', short: 'ARS', color: '#EF0107', text: '#FFFFFF', league: '英超'},
  {name: '阿斯顿维拉', short: 'AVL', color: '#670E36', text: '#FFFFFF', league: '英超'},
  {name: '伯恩茅斯', short: 'BOU', color: '#DA291C', text: '#FFFFFF', league: '英超'},
  {name: '布伦特福德', short: 'BRE', color: '#E30613', text: '#FFFFFF', league: '英超'},
  {name: '布莱顿', short: 'BRI', color: '#0057B8', text: '#FFFFFF', league: '英超'},
  {name: '切尔西', short: 'CHE', color: '#034694', text: '#FFFFFF', league: '英超'},
  {name: '水晶宫', short: 'CRY', color: '#1B458F', text: '#FFFFFF', league: '英超'},
  {name: '埃弗顿', short: 'EVE', color: '#003399', text: '#FFFFFF', league: '英超'},
  {name: '富勒姆', short: 'FUL', color: '#1A1A1A', text: '#FFFFFF', league: '英超'},
  {name: '伊普斯维奇', short: 'IPS', color: '#3764A8', text: '#FFFFFF', league: '英超'},
  {name: '莱斯特城', short: 'LEI', color: '#003090', text: '#FFFFFF', league: '英超'},
  {name: '利物浦', short: 'LIV', color: '#C8102E', text: '#FFFFFF', league: '英超'},
  {name: '曼城', short: 'MCI', color: '#6CABDD', text: '#111111', league: '英超'},
  {name: '曼联', short: 'MUN', color: '#DA291C', text: '#FFFFFF', league: '英超'},
  {name: '纽卡斯尔', short: 'NEW', color: '#241F20', text: '#FFFFFF', league: '英超'},
  {name: '诺丁汉森林', short: 'NFO', color: '#DD0000', text: '#FFFFFF', league: '英超'},
  {name: '南安普顿', short: 'SOU', color: '#D71920', text: '#FFFFFF', league: '英超'},
  {name: '热刺', short: 'TOT', color: '#132257', text: '#FFFFFF', league: '英超'},
  {name: '西汉姆', short: 'WHU', color: '#7A263A', text: '#FFFFFF', league: '英超'},
  {name: '狼队', short: 'WOL', color: '#FDB913', text: '#111111', league: '英超'},
  // 西甲
  {name: '阿拉维斯', short: 'ALA', color: '#0761AF', text: '#FFFFFF', league: '西甲'},
  {name: '毕尔巴鄂竞技', short: 'ATH', color: '#EE2523', text: '#FFFFFF', league: '西甲'},
  {name: '马德里竞技', short: 'ATM', color: '#CB3524', text: '#FFFFFF', league: '西甲'},
  {name: '巴塞罗那', short: 'BAR', color: '#A50044', text: '#FFFFFF', league: '西甲'},
  {name: '塞尔塔', short: 'CEL', color: '#8AC3EE', text: '#111111', league: '西甲'},
  {name: '赫罗纳', short: 'GIR', color: '#CD2534', text: '#FFFFFF', league: '西甲'},
  {name: '赫塔费', short: 'GET', color: '#005999', text: '#FFFFFF', league: '西甲'},
  {name: '莱加内斯', short: 'LEG', color: '#005C99', text: '#FFFFFF', league: '西甲'},
  {name: '马略卡', short: 'MLL', color: '#E20613', text: '#FFFFFF', league: '西甲'},
  {name: '奥萨苏纳', short: 'OSA', color: '#0A346F', text: '#FFFFFF', league: '西甲'},
  {name: '巴列卡诺', short: 'RAY', color: '#E53027', text: '#FFFFFF', league: '西甲'},
  {name: '皇家贝蒂斯', short: 'BET', color: '#00954C', text: '#FFFFFF', league: '西甲'},
  {name: '皇家马德里', short: 'RMA', color: '#FFFFFF', text: '#111111', league: '西甲'},
  {name: '皇家社会', short: 'RSO', color: '#0067B1', text: '#FFFFFF', league: '西甲'},
  {name: '塞维利亚', short: 'SEV', color: '#D9181F', text: '#FFFFFF', league: '西甲'},
  {name: '巴伦西亚', short: 'VAL', color: '#F18E00', text: '#111111', league: '西甲'},
  {name: '比利亚雷亚尔', short: 'VIL', color: '#FDE100', text: '#111111', league: '西甲'},
  {name: '拉斯帕尔马斯', short: 'LPA', color: '#FEDF00', text: '#111111', league: '西甲'},
  {name: '西班牙人', short: 'ESP', color: '#0070B8', text: '#FFFFFF', league: '西甲'},
  {name: '巴利亚多利德', short: 'VLL', color: '#5B1E8E', text: '#FFFFFF', league: '西甲'},
  // 意甲
  {name: '亚特兰大', short: 'ATA', color: '#1E71B8', text: '#FFFFFF', league: '意甲'},
  {name: '博洛尼亚', short: 'BOL', color: '#A21C26', text: '#FFFFFF', league: '意甲'},
  {name: '卡利亚里', short: 'CAG', color: '#A5002B', text: '#FFFFFF', league: '意甲'},
  {name: '科莫', short: 'COM', color: '#0033A0', text: '#FFFFFF', league: '意甲'},
  {name: '佛罗伦萨', short: 'FIO', color: '#592C82', text: '#FFFFFF', league: '意甲'},
  {name: '热那亚', short: 'GEN', color: '#B21F1F', text: '#FFFFFF', league: '意甲'},
  {name: '国际米兰', short: 'INT', color: '#0068A8', text: '#FFFFFF', league: '意甲'},
  {name: '尤文图斯', short: 'JUV', color: '#1A1A1A', text: '#FFFFFF', league: '意甲'},
  {name: '拉齐奥', short: 'LAZ', color: '#87D8F7', text: '#111111', league: '意甲'},
  {name: '莱切', short: 'LEC', color: '#FFE100', text: '#111111', league: '意甲'},
  {name: 'AC米兰', short: 'MIL', color: '#FB090B', text: '#FFFFFF', league: '意甲'},
  {name: '那不勒斯', short: 'NAP', color: '#12A0D7', text: '#FFFFFF', league: '意甲'},
  {name: '帕尔马', short: 'PAR', color: '#FFD700', text: '#111111', league: '意甲'},
  {name: '罗马', short: 'ROM', color: '#8E1F2F', text: '#FFFFFF', league: '意甲'},
  {name: '都灵', short: 'TOR', color: '#881600', text: '#FFFFFF', league: '意甲'},
  {name: '乌迪内斯', short: 'UDI', color: '#000000', text: '#FFFFFF', league: '意甲'},
  {name: '维罗纳', short: 'VER', color: '#FFD700', text: '#111111', league: '意甲'},
  {name: '恩波利', short: 'EMP', color: '#0033A0', text: '#FFFFFF', league: '意甲'},
  {name: '威尼斯', short: 'VEN', color: '#000000', text: '#FFFFFF', league: '意甲'},
  {name: '蒙扎', short: 'MON', color: '#E2001A', text: '#FFFFFF', league: '意甲'},
  // 德甲
  {name: '勒沃库森', short: 'B04', color: '#E32219', text: '#FFFFFF', league: '德甲'},
  {name: '拜仁慕尼黑', short: 'BAY', color: '#DC052D', text: '#FFFFFF', league: '德甲'},
  {name: '多特蒙德', short: 'DOR', color: '#FDE100', text: '#111111', league: '德甲'},
  {name: '法兰克福', short: 'SGE', color: '#E1000F', text: '#FFFFFF', league: '德甲'},
  {name: '弗赖堡', short: 'SCF', color: '#000000', text: '#FFFFFF', league: '德甲'},
  {name: '海登海姆', short: 'FCH', color: '#E2001A', text: '#FFFFFF', league: '德甲'},
  {name: '霍芬海姆', short: 'TSG', color: '#1C63B7', text: '#FFFFFF', league: '德甲'},
  {name: '美因茨', short: 'M05', color: '#C3141E', text: '#FFFFFF', league: '德甲'},
  {name: '门兴', short: 'BMG', color: '#000000', text: '#FFFFFF', league: '德甲'},
  {name: '奥格斯堡', short: 'FCA', color: '#BA3733', text: '#FFFFFF', league: '德甲'},
  {name: '波鸿', short: 'BOC', color: '#005CA9', text: '#FFFFFF', league: '德甲'},
  {name: '沃尔夫斯堡', short: 'WOB', color: '#65B32E', text: '#111111', league: '德甲'},
  {name: '莱比锡', short: 'RBL', color: '#DD0741', text: '#FFFFFF', league: '德甲'},
  {name: '斯图加特', short: 'VFB', color: '#E32219', text: '#FFFFFF', league: '德甲'},
  {name: '云达不莱梅', short: 'SVW', color: '#1D9053', text: '#FFFFFF', league: '德甲'},
  {name: '柏林联合', short: 'FCU', color: '#EA1616', text: '#FFFFFF', league: '德甲'},
  {name: '基尔', short: 'KSV', color: '#003399', text: '#FFFFFF', league: '德甲'},
  {name: '圣保利', short: 'STP', color: '#5B1E8E', text: '#FFFFFF', league: '德甲'},
  // 法甲
  {name: '巴黎圣日耳曼', short: 'PSG', color: '#004170', text: '#FFFFFF', league: '法甲'},
  {name: '马赛', short: 'OM', color: '#2FAEE0', text: '#111111', league: '法甲'},
  {name: '摩纳哥', short: 'ASM', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '里尔', short: 'LOSC', color: '#E01E13', text: '#FFFFFF', league: '法甲'},
  {name: '里昂', short: 'OL', color: '#FFFFFF', text: '#111111', league: '法甲'},
  {name: '尼斯', short: 'OGC', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '朗斯', short: 'RCL', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '雷恩', short: 'SRFC', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '斯特拉斯堡', short: 'RCS', color: '#005CA9', text: '#FFFFFF', league: '法甲'},
  {name: '图卢兹', short: 'TFC', color: '#5B1E8E', text: '#FFFFFF', league: '法甲'},
  {name: '南特', short: 'FCN', color: '#FFE100', text: '#111111', league: '法甲'},
  {name: '布雷斯特', short: 'SB29', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '勒阿弗尔', short: 'HAC', color: '#0033A0', text: '#FFFFFF', league: '法甲'},
  {name: '昂热', short: 'SCO', color: '#000000', text: '#FFFFFF', league: '法甲'},
  {name: '蒙彼利埃', short: 'MHSC', color: '#F36F21', text: '#FFFFFF', league: '法甲'},
  {name: '兰斯', short: 'SDR', color: '#E30613', text: '#FFFFFF', league: '法甲'},
  {name: '欧塞尔', short: 'AJA', color: '#FFFFFF', text: '#111111', league: '法甲'},
  {name: '圣埃蒂安', short: 'ASSE', color: '#009A44', text: '#FFFFFF', league: '法甲'},
  // 本队
  {name: '自由人FC', short: 'FC', color: '#2D5016', text: '#FFFFFF', league: '本队'}
]

export function homeTeamOf(name: string | null): HomeTeam | undefined {
  return HOME_TEAMS.find((t) => t.name === name)
}

/** 按联赛分组的主队列表 */
export function homeTeamsByLeague(league: string): HomeTeam[] {
  return HOME_TEAMS.filter((t) => t.league === league)
}

// ==================== 战术板配置 ====================

/** 战术线/标记类型（pass/run/defend 为线条，flag 我方队员标记（蓝），opp 对方球员标记（红）） */
export const TACTIC_LINE_TYPES = [
  {key: 'pass', label: '传球', icon: 'i-mdi-arrow-right-top', color: '#2E86DE'},
  {key: 'run', label: '跑位', icon: 'i-mdi-run-fast', color: '#C9A227'},
  {key: 'defend', label: '回防', icon: 'i-mdi-shield-half-full', color: '#B03A2E'},
  {key: 'flag', label: '我方', icon: 'i-mdi-account', color: '#2E86DE'},
  {key: 'opp', label: '对方', icon: 'i-mdi-account-alert', color: '#B03A2E'}
] as const

export type TacticLineKind = (typeof TACTIC_LINE_TYPES)[number]['key']

/** 分组方案 */
export const TEAM_SCHEMES = [
  {key: 'A', label: 'A队 / B队', options: [{key: 'A', label: 'A队'}, {key: 'B', label: 'B队'}]},
  {key: 'red', label: '红队 / 蓝队', options: [{key: 'red', label: '红队'}, {key: 'blue', label: '蓝队'}]}
] as const

/** 视角模式 */
export const VIEW_MODES = [
  {key: 'half', label: '半场'},
  {key: 'full', label: '全场'}
] as const

/** 比赛类型（内战/外战） */
export const MATCH_TYPES = [
  {key: 'internal', label: '内战', desc: '队内对抗'},
  {key: 'external', label: '外战', desc: '对外比赛'}
] as const

export type MatchType = (typeof MATCH_TYPES)[number]['key']

/** FIFA 技能/特性星级 */
export const RARITY_STYLES = {
  gold: {label: '金', badgeCls: 'bg-amber-400 text-black', ringCls: 'ring-amber-400/60', star: '★★★'},
  silver: {label: '银', badgeCls: 'bg-slate-300 text-slate-900', ringCls: 'ring-slate-300/60', star: '★★☆'},
  bronze: {label: '铜', badgeCls: 'bg-amber-700 text-amber-50', ringCls: 'ring-amber-700/60', star: '★☆☆'}
} as const

/** 内战可选分组数 */
export const TEAM_GROUPS_OPTIONS = [2, 3, 4] as const

/** 各取消模式默认值：开赛前 6 小时 / 活动当天 12 点后 */
export const CANCEL_MODE_DEFAULTS: Record<CancelCutoffMode, number> = {hours: 6, sameday: 12}

export type CancelCutoffMode = 'hours' | 'sameday'

/** 全局默认取消规则：开赛前 6 小时 */
export const DEFAULT_CANCEL_RULE = {mode: 'hours' as CancelCutoffMode, value: CANCEL_MODE_DEFAULTS.hours}

/** 截止规则文案（约定第一条，随发布页设置生成） */
export function cancelRuleText(mode: CancelCutoffMode, value: number): string {
  if (mode === 'sameday') {
    return `请大家提前确认好时间，活动当天 ${value} 点后不可取消报名，此前取消可免分摊费用；截止后取消仍需正常 AA，可自行寻找替补顶替`
  }
  return `请大家提前确认好时间，开赛前 ${value} 小时内不可取消报名，此前取消可免分摊费用；截止后取消仍需正常 AA，可自行寻找替补顶替`
}

/** 默认参赛约定（按取消规则生成，发布页/海报共用） */
export function buildDefaultNotice(mode: CancelCutoffMode = DEFAULT_CANCEL_RULE.mode, value: number = DEFAULT_CANCEL_RULE.value): string {
  return `1. ${cancelRuleText(mode, value)}；\n2. 尽量提前10分钟到场热身熟悉队友；\n3. 完成报名即代表自愿遵守微信群所有公告约定。`
}

/** 兼容旧引用的静态默认文案 */
export const DEFAULT_ACTIVITY_NOTICE = buildDefaultNotice()

/** 按活动取消规则判断当前是否允许取消报名 */
export function canWithdrawByRule(
  a: {activity_time: string; cancel_cutoff_mode?: CancelCutoffMode | null; cancel_cutoff_value?: number | null} | null | undefined,
  now: number = Date.now()
): {allowed: boolean; reason: string} {
  if (!a) return {allowed: false, reason: '活动不存在'}
  const kickoff = new Date(a.activity_time).getTime()
  if (now >= kickoff) return {allowed: false, reason: '活动已开始，无法取消报名'}
  const mode: CancelCutoffMode = a.cancel_cutoff_mode || 'hours'
  const value = a.cancel_cutoff_value ?? DEFAULT_CANCEL_RULE.value
  if (mode === 'sameday') {
    // 仅活动当天 value 点后限制取消；此前任意时间可取消
    const nowDate = new Date(now)
    const actDate = new Date(a.activity_time)
    const sameDay =
      nowDate.getFullYear() === actDate.getFullYear() &&
      nowDate.getMonth() === actDate.getMonth() &&
      nowDate.getDate() === actDate.getDate()
    return sameDay && nowDate.getHours() >= value
      ? {allowed: false, reason: `活动当天 ${value} 点后不允许取消报名`}
      : {allowed: true, reason: ''}
  }
  return kickoff - now >= value * 3600 * 1000
    ? {allowed: true, reason: ''}
    : {allowed: false, reason: `开赛前 ${value} 小时内不允许取消报名`}
}

/** 场地/水费默认值：5人内战 350/30，8人内战 850/60，外战均减半；11人及其他无默认（0 表示无默认） */
export function defaultMatchFees(a: {match_format?: string | null; match_type?: string | null} | null | undefined): {venue: number; water: number} {
  if (!a) return {venue: 0, water: 0}
  const base =
    a.match_format === '5'
      ? {venue: 350, water: 30}
      : a.match_format === '8'
        ? {venue: 850, water: 60}
        : {venue: 0, water: 0}
  if (a.match_type === 'external') {
    return {venue: base.venue / 2, water: base.water / 2}
  }
  return base
}

/** 默认微信收款码：与头像同属 Supabase Storage 公共域名，便于小程序长按识别。 */
const SUPABASE_BASE = String(process.env.TARO_APP_SUPABASE_URL || '')
export const DEFAULT_PAYMENT_QR_URL = `${SUPABASE_BASE}/storage/v1/object/public/minicode/posters/wechat-pay-qr.png`

/* ---------------- 经验与自定义基础六维成长体系 ---------------- */
/** 出勤单场所得经验 */
export const EXP_PER_MATCH = 100
/** 升级经验基数：Lv.L → Lv.(L+1) 需要基数 × L */
export const EXP_PER_LEVEL = 100
/** 每次升级获得的自由属性点 */
export const POINTS_PER_LEVEL = 5
/** 能力值理论满分（FIFA 体系，100 不是满分） */
export const ABILITY_MAX = 99
/** 自定义基础六维必须合计 300，单项为 40..70；未提供值时按均衡 50 回落。 */
export const BASE_ABILITY_TOTAL = 300
export const MIN_BASE_ABILITY = 40
export const MAX_BASE_ABILITY = 70
export const DEFAULT_ABILITY = 50

const INITIAL_ABILITY_GROWTH_CAP = 15
const MAX_ABILITY_GROWTH_CAP = 39
const APPEARANCES_PER_CAP = 5
const REFERENCE_ABILITY_BASE = 60
const REFERENCE_CAP_BASE = 75
const REFERENCE_CAP_MODIFIERS = [10, 8, 3, 0, -5, -10] as const

/** 成长数值运行时配置（由队长后台设置，默认与常量一致） */
let growthConfig = {
  exp_per_level: EXP_PER_LEVEL,
  exp_per_match: EXP_PER_MATCH,
  activity_per_match: ACTIVITY_PER_APPEARANCE,
  points_per_level: POINTS_PER_LEVEL,
  mvp_exp: 50,
  mvp_activity: 15,
  defender_exp: 50,
  defender_activity: 15,
  goal_exp: 30,
  goal_activity: 5,
  assist_exp: 20,
  assist_activity: 5,
  squat_target: 8
}

/** 运行时成长配置（部分字段可省略） */
export type RuntimeGrowthConfig = typeof growthConfig

const GROWTH_MIN_1: (keyof RuntimeGrowthConfig)[] = [
  'exp_per_level',
  'exp_per_match',
  'activity_per_match',
  'points_per_level',
  'squat_target'
]

export function setGrowthConfig(c: Partial<RuntimeGrowthConfig>) {
  const next = {...growthConfig, ...c}
  for (const k of Object.keys(next) as (keyof RuntimeGrowthConfig)[]) {
    const min = GROWTH_MIN_1.includes(k) ? 1 : 0
    const value = next[k]
    next[k] = (Number.isFinite(value)
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(min, Math.floor(value)))
      : growthConfig[k]) as never
  }
  next.points_per_level = POINTS_PER_LEVEL
  growthConfig = next
}

export function getGrowthConfig() {
  return growthConfig
}

export interface ExpLevelProgress {
  level: number
  /** 当前等级内已获得经验 */
  earned: number
  /** 从当前等级升到下一级所需经验 */
  required: number
  progressPct: number
}

function validTotalExp(exp: number): number {
  if (!Number.isFinite(exp)) return 0
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(exp)))
}

/** Lv.L 的累计经验门槛：base × L × (L - 1) / 2。 */
function expThreshold(level: number, base: number): number {
  // 先除以 2，确保所有可表示门槛都保持安全整数精度。
  const left = level % 2 === 0 ? level / 2 : level
  const right = level % 2 === 0 ? level - 1 : (level - 1) / 2
  const triangular = left * right
  if (triangular > Math.floor(Number.MAX_SAFE_INTEGER / base)) return Number.POSITIVE_INFINITY
  return triangular * base
}

/** 当前经验的等级、等级内经验与升级成本。闭式解后校正，精确处理累计门槛边界。 */
export function expLevelProgress(exp: number): ExpLevelProgress {
  const totalExp = validTotalExp(exp)
  const configuredBase = growthConfig.exp_per_level
  const base = Number.isFinite(configuredBase)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(configuredBase)))
    : EXP_PER_LEVEL
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * totalExp) / base)) / 2))

  while (level > 1 && expThreshold(level, base) > totalExp) level -= 1
  while (expThreshold(level + 1, base) <= totalExp) level += 1

  const earned = totalExp - expThreshold(level, base)
  const required = base * level
  return {
    level,
    earned,
    required,
    progressPct: (earned / required) * 100
  }
}

/** 经验等级（Lv.1 起，升级成本随当前等级线性增长）。 */
export function expLevel(exp: number): number {
  return expLevelProgress(exp).level
}

/** 当前等级升级进度（0-100）。 */
export function expProgressPct(exp: number): number {
  return expLevelProgress(exp).progressPct
}

/** 出勤与自定义基础六维 → 分项上限；每项初始可成长 15，之后每 5 场 +1，成长空间最多 39。 */
export function abilityCapsOf(appearances: number, baseValues: AbilityCarrier): Record<AbilityKey, number> {
  const validAppearances = Number.isFinite(appearances) ? Math.max(0, Math.floor(appearances)) : 0
  const growthCap = Math.min(
    INITIAL_ABILITY_GROWTH_CAP + Math.floor(validAppearances / APPEARANCES_PER_CAP),
    MAX_ABILITY_GROWTH_CAP
  )
  const caps = {} as Record<AbilityKey, number>
  for (const {key} of ABILITY_DIMENSIONS) {
    const value = baseValues[key]
    const base = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_ABILITY
    caps[key] = Math.min(ABILITY_MAX, base + growthCap)
  }
  return caps
}

/**
 * 可分配总预算沿用固定参考曲线，与自定义基础值和场上位置无关。
 * 参考中心上限从 75 起每 5 场 +1，各固定修正项高于 60 的容量合计取一半。
 */
export function abilityBudgetOf(appearances: number): number {
  const validAppearances = Number.isFinite(appearances) ? Math.max(0, Math.floor(appearances)) : 0
  const centralCap = Math.min(
    REFERENCE_CAP_BASE + Math.floor(validAppearances / APPEARANCES_PER_CAP),
    ABILITY_MAX
  )
  const capacity = REFERENCE_CAP_MODIFIERS.reduce((sum, modifier) => {
    const cap = Math.max(REFERENCE_ABILITY_BASE, Math.min(ABILITY_MAX, centralCap + modifier))
    return sum + cap - REFERENCE_ABILITY_BASE
  }, 0)
  return Math.floor(capacity / 2)
}

/** 报名门槛：资料缺失项（昵称/球衣号/位置），完整返回 null */
export function profileIncomplete(p?: {
  nickname?: string | null
  jersey_number?: number | null
  preferred_position?: string | null
} | null): string | null {
  if (!p) return '基础资料'
  if (!p.nickname?.trim()) return '昵称'
  if (p.jersey_number == null) return '球衣号码'
  if (!p.preferred_position?.trim()) return '场上位置'
  return null
}

/** 技能加成载体（member_skills 行的子集） */
export interface SkillBonusCarrier {
  equipped: boolean
  /** 技能等级（Lv1 起，加成 = bonus_value × level） */
  level?: number
  skill?: {bonus_key: string | null; bonus_value: number} | null
}

/** 汇总已装备技能的六维加成（随技能等级缩放） */
export function skillBonuses(list: SkillBonusCarrier[] | null | undefined): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {}
  for (const m of list || []) {
    if (!m.equipped || !m.skill?.bonus_key || !m.skill.bonus_value) continue
    const bonus = m.skill.bonus_value * (m.level || 1)
    out[m.skill.bonus_key as AbilityKey] = (out[m.skill.bonus_key as AbilityKey] || 0) + bonus
  }
  return out
}

/** 单项正加成直接生效但最多 8；负值作为惩罚保留，不抵扣正加成总预算。 */
export const MAX_EFFECTIVE_BONUS_PER_DIMENSION = 8

export function effectiveAbilityBonus(rawBonus: number): number {
  if (!Number.isFinite(rawBonus)) return 0
  const rounded = Math.round(rawBonus)
  if (rounded <= 0) return rounded || 0
  return Math.min(rounded, MAX_EFFECTIVE_BONUS_PER_DIMENSION)
}

/** 六维正加成的总预算，防止装备/技能/活跃等级叠加后同时顶满。 */
export const MAX_EFFECTIVE_BONUS_TOTAL = 30

/**
 * 六维原始加成先逐项限制正加成，再以最大余数法按比例压到总预算内。
 * 负值保持不变；余数相同时按 ABILITY_DIMENSIONS 的固定顺序分配，保证所有端结果一致。
 */
export function effectiveBonuses(
  rawBonuses: Partial<Record<AbilityKey, number>> | null | undefined
): Record<AbilityKey, number> {
  const out = {} as Record<AbilityKey, number>
  let positiveTotal = 0
  for (const {key} of ABILITY_DIMENSIONS) {
    const value = effectiveAbilityBonus(rawBonuses?.[key] ?? 0)
    out[key] = value
    positiveTotal += Math.max(0, value)
  }
  if (positiveTotal <= MAX_EFFECTIVE_BONUS_TOTAL) return out

  const scale = MAX_EFFECTIVE_BONUS_TOTAL / positiveTotal
  const remainders: {key: AbilityKey; index: number; remainder: number}[] = []
  let assigned = 0
  ABILITY_DIMENSIONS.forEach(({key}, index) => {
    if (out[key] <= 0) return
    const scaled = out[key] * scale
    const whole = Math.floor(scaled)
    out[key] = whole
    assigned += whole
    remainders.push({key, index, remainder: scaled - whole})
  })
  remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let i = 0; i < MAX_EFFECTIVE_BONUS_TOTAL - assigned; i++) {
    out[remainders[i].key] += 1
  }
  return out
}

/** 基础六维 + 统一限制后的组合加成（最终单项封顶 99）。 */
export function abilitiesWithBonus(
  p: AbilityCarrier,
  bonuses: Partial<Record<AbilityKey, number>> | null | undefined
): Record<AbilityKey, number> {
  const effective = effectiveBonuses(bonuses)
  const out = {} as Record<AbilityKey, number>
  for (const d of ABILITY_DIMENSIONS) {
    out[d.key] = Math.min(ABILITY_MAX, (p[d.key] ?? DEFAULT_ABILITY) + effective[d.key])
  }
  return out
}

/* ---------------- 装备系统 ---------------- */

/** 装备槽位定义 */
export const EQUIPMENT_SLOTS = [
  {key: 'boots', label: '球鞋', icon: 'i-mdi-shoe-sneaker'},
  {key: 'shinpad', label: '护腿', icon: 'i-mdi-shield-outline'},
  {key: 'gloves', label: '手套', icon: 'i-mdi-hand-back-right-outline'},
  {key: 'jersey', label: '球衣', icon: 'i-mdi-tshirt-crew'},
  {key: 'socks', label: '球袜', icon: 'i-mdi-sock'},
  {key: 'kneepad', label: '护膝', icon: 'i-mdi-shield-half-full'},
  {key: 'wristband', label: '护腕', icon: 'i-mdi-watch-variant'},
  {key: 'supplement', label: '补剂', icon: 'i-mdi-bottle-tonic-plus'}
] as const

export type EquipmentSlotKey = (typeof EQUIPMENT_SLOTS)[number]['key']

/** 装备品质样式（与卡片品质金属渐变呼应） */
export const EQUIPMENT_RARITY: Record<string, {label: string; badgeCls: string; ringCls: string; color: string}> = {
  legend: {label: '传奇', badgeCls: 'tier-legend', ringCls: 'ring-amber-400/70', color: '#C9A227'},
  gold: {label: '黄金', badgeCls: 'tier-gold', ringCls: 'ring-amber-400/60', color: '#C9A227'},
  silver: {label: '白银', badgeCls: 'tier-silver', ringCls: 'ring-slate-300/60', color: '#9DA3A8'},
  bronze: {label: '青铜', badgeCls: 'tier-bronze', ringCls: 'ring-amber-700/60', color: '#8C6239'}
}

/** 专属特效定义（装备特效展示） */
export interface EquipmentEffect {
  key: string
  label: string
  icon: string
  desc: string
  /** 特效光效样式类 */
  glowCls: string
}

export const EQUIPMENT_EFFECTS: Record<string, EquipmentEffect> = {
  wind_step: {key: 'wind_step', label: '风之步', icon: 'i-mdi-weather-windy', desc: '移动速度提升', glowCls: 'effect-wind'},
  lightning: {key: 'lightning', label: '闪电冲刺', icon: 'i-mdi-flash', desc: '冲刺时拖曳电光残影', glowCls: 'effect-lightning'},
  iron_wall: {key: 'iron_wall', label: '铁壁', icon: 'i-mdi-shield-star', desc: '防守时泛起金色护盾', glowCls: 'effect-iron'},
  golden_touch: {key: 'golden_touch', label: '黄金触感', icon: 'i-mdi-hand-coin-outline', desc: '控球时指尖泛金光', glowCls: 'effect-gold'},
  endurance: {key: 'endurance', label: '耐力', icon: 'i-mdi-heart-pulse', desc: '全场飞奔身披流光', glowCls: 'effect-endurance'}
}

export function equipmentEffectOf(key: string | null | undefined): EquipmentEffect | undefined {
  if (!key) return undefined
  return EQUIPMENT_EFFECTS[key]
}

/** 装备加成载体（member_equipment 行的子集，用于汇总六维加成） */
export interface EquipmentBonusCarrier {
  equipped: boolean
  equipment?: {bonuses: Record<string, number>} | null
}

/** 汇总已装备装备的六维加成 */
export function equipmentBonuses(list: EquipmentBonusCarrier[] | null | undefined): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {}
  for (const m of list || []) {
    if (!m.equipped || !m.equipment?.bonuses) continue
    for (const [k, v] of Object.entries(m.equipment.bonuses)) {
      if (ABILITY_DIMENSIONS.some((d) => d.key === k)) {
        out[k as AbilityKey] = (out[k as AbilityKey] || 0) + (v || 0)
      }
    }
  }
  return out
}

/* ---------------- 活跃等级加成（活跃度等级与经验等级相互独立） ---------------- */

/** 各活跃度等级提供的全六维加成。 */
export const LEVEL_ABILITY_BONUS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 1,
  4: 1,
  5: 2
}

/** 根据活跃度等级返回全六维加成值。 */
export function levelAbilityBonus(activity: number): number {
  const def = levelFromActivity(activity)
  return LEVEL_ABILITY_BONUS[def.level] ?? 0
}

/** 汇总活跃等级加成为六维加成对象（全维度统一加成）。 */
export function levelBonuses(activity: number): Partial<Record<AbilityKey, number>> {
  const b = levelAbilityBonus(activity)
  if (!b) return {}
  const out: Partial<Record<AbilityKey, number>> = {}
  for (const d of ABILITY_DIMENSIONS) {
    out[d.key] = b
  }
  return out
}

/** 合并多组原始加成（装备 + 技能 + 活跃等级）；限制与总预算仅在合并后应用。 */
export function mergeBonuses(...groups: (Partial<Record<AbilityKey, number>> | null | undefined)[]): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {}
  for (const g of groups) {
    if (!g) continue
    for (const [k, v] of Object.entries(g)) {
      out[k as AbilityKey] = (out[k as AbilityKey] || 0) + (v || 0)
    }
  }
  return out
}

/** 队员卡能力口径：基础六维 + 装备 + 技能 + 活跃等级的统一加成（各页共用）。 */
export interface MemberAbilitySource extends AbilityCarrier {
  member_skills?: SkillBonusCarrier[] | null
  member_equipment?: EquipmentBonusCarrier[] | null
  activity?: number | null
}

/** 统一计算队员最终六维：正加成受单项/总量限制，最终单项封顶 99。 */
export function memberFinalAbilities(m: MemberAbilitySource): Record<AbilityKey, number> {
  return abilitiesWithBonus(
    m,
    mergeBonuses(equipmentBonuses(m.member_equipment), skillBonuses(m.member_skills), levelBonuses(m.activity ?? 0))
  )
}

/** 活跃度兑换属性点的单位消耗 */
export const ACTIVITY_PER_POINT = 200
