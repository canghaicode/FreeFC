// @title 球星卡

import {useCallback, useEffect, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Avatar, CachedAvatarImage} from '@/components/Avatar'
import {FootPrints} from '@/components/FootPrints'
import {LogoBg} from '@/components/LogoBg'
import {PlayerPoster} from '@/components/PlayerPoster'
import RadarChart from '@/components/RadarChart'
import {withRouteGuard} from '@/components/RouteGuard'
import {TitleBadge} from '@/components/TitleBadge'
import {
  ABILITY_DIMENSIONS,
  type AbilityKey,
  APPEARANCES_PER_CAP,
  abilitiesWithBonus,
  abilityCapOf,
  cardTier,
  EQUIPMENT_EFFECTS,
  equipmentBonuses,
  expLevel,
  expProgressPct,
  getGrowthConfig,
  isNegativeTrait,
  levelBonuses,
  levelFromActivity,
  mergeBonuses,
  overallAbility,
  RARITY_STYLES,
  type SkillBonusCarrier, 
  skillBonuses
} from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {allocPoints, getMyAppearanceCount, getMyEquipment, getMyMemberSkills} from '@/db/api'
import type {MemberEquipment, MemberSkill} from '@/db/types'
function AbilityPage() {
  const {profile, refreshProfile} = useAuth()
  const [skills, setSkills] = useState<MemberSkill[]>([])
  const [equipment, setEquipment] = useState<MemberEquipment[]>([])
  const [appearances, setAppearances] = useState(0)
  const [allocating, setAllocating] = useState<AbilityKey | null>(null)
  const [growthCfg, setGrowthCfg] = useState(() => getGrowthConfig())
  const [showPoster, setShowPoster] = useState(false)

  useEffect(() => {
    // 队长后台可能已更新成长数值，进页时同步
    setGrowthCfg(getGrowthConfig())
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [ms, eq, app] = await Promise.all([
        getMyMemberSkills().catch(() => []),
        getMyEquipment().catch(() => []),
        getMyAppearanceCount().catch(() => 0)
      ])
      setSkills(ms)
      setEquipment(eq)
      setAppearances(app)
    } catch (err) {
      console.error('Failed to load ability data:', err)
    }
  }, [])


  useDidShow(() => {
    refreshProfile()
    loadData()
  })

  const skillBonusMap = useMemo(() => skillBonuses(skills), [skills])
  const equipBonusMap = useMemo(() => equipmentBonuses(equipment), [equipment])
  const levelBonusMap = useMemo(() => levelBonuses(profile?.activity ?? 0), [profile?.activity])
  const bonuses = useMemo(
    () => mergeBonuses(skillBonusMap, equipBonusMap, levelBonusMap),
    [skillBonusMap, equipBonusMap, levelBonusMap]
  )
  const activityPoints = profile?.activity ?? 0
  const base = useMemo(
    () =>
      ({
        ab_pace: profile?.ab_pace,
        ab_shooting: profile?.ab_shooting,
        ab_passing: profile?.ab_passing,
        ab_dribbling: profile?.ab_dribbling,
        ab_defending: profile?.ab_defending,
        ab_stamina: profile?.ab_stamina
      }) as Record<AbilityKey, number | null | undefined>,
    [profile]
  )
  const final = useMemo(() => abilitiesWithBonus(base, bonuses), [base, bonuses])
  const ovr = useMemo(() => overallAbility(final), [final])
  const tier = useMemo(() => cardTier(ovr), [ovr])
  const cap = abilityCapOf(appearances)
  const freePoints = profile?.free_points ?? 0
  const exp = profile?.exp ?? 0
  const levelDef = levelFromActivity(profile?.activity ?? 0)
  const expLevelNum = expLevel(exp)

  const handleAlloc = async (key: AbilityKey, delta: number) => {
    if (allocating) return
    setAllocating(key)
    try {
      const res = await allocPoints(key, delta)
      if (res.ok) {
        const label = ABILITY_DIMENSIONS.find((d) => d.key === key)?.label
        Taro.showToast({title: `${delta > 0 ? '+' : '-'}1 ${label}`, icon: 'none'})
        await refreshProfile()
      } else {
        Taro.showToast({title: res.message || '操作失败', icon: 'none'})
      }
    } finally {
      setAllocating(null)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col relative">
      <LogoBg />
      <div className="flex-1 overflow-y-auto pb-8 relative z-10">
        {/* 页头 */}
        <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
          <h1 className="font-heading text-3xl text-primary-foreground">我的球星卡</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="i-mdi-card-account-details-star-outline text-2xl text-primary-foreground/80" />
            <p className="text-xl text-primary-foreground/80">出勤涨经验 · 升级得点 · 加点变强</p>
          </div>
        </div>

        <div className="px-5 -mt-6 flex flex-col gap-4">
          {/* FIFA 风球星卡实时预览（含技能加成） */}
          <div className="relative rounded-2xl overflow-hidden lift-glow fade-rise">
            {/* 背景：头像弱化版本 + 品质色调叠加 */}
            {profile?.avatar_url ? (
              <CachedAvatarImage
                src={profile.avatar_url as string}
                lazyLoad
                mode="aspectFill"
                className="absolute inset-0 w-full h-full"
                style={{opacity: 0.35}}
              />
            ) : (
              <div className={`absolute inset-0 ${tier.badgeCls} opacity-90`} />
            )}
            <div className={`absolute inset-0 ${tier.badgeCls} opacity-25`} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/40" />
            <div className="absolute inset-0 vine-corner opacity-30" />

            <div className="relative flex flex-col p-5 gap-4">
              <div className="flex flex-row items-center gap-4">
                <div className="flex flex-col items-center gap-1 w-24 shrink-0">
                  <span className="font-heading text-6xl leading-none drop-shadow">{ovr ?? '--'}</span>
                  <span className="text-lg opacity-80">总评 OVR</span>
                  <span className="text-base opacity-80">上限 {cap}</span>
                  <span className="flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-black/25">
                    <div className={`${tier.icon} text-lg`} />
                    <span className="text-base">{tier.name}</span>
                  </span>
                  <span className="text-lg mt-1">{profile?.preferred_position || '未设置位置'}</span>
                  {profile?.jersey_number != null && (
                    <span className="px-2 py-0.5 rounded-md bg-black/25 text-base">#{profile?.jersey_number}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <Avatar url={profile?.avatar_url as string | null} name={profile?.nickname as string | null} size="lg" />
                  <span className="font-heading text-2xl truncate w-full text-center drop-shadow">
                    {(profile?.nickname as string) || '未命名队员'}
                  </span>
                  <RadarChart data={final} size={180} canvasId="radar-ability" />
                </div>
              </div>

              {/* 左：称号/特质/技能   右：左右脚 */}
              <div className="w-full flex flex-row items-stretch gap-3 bg-black/15 rounded-xl p-3">
                <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
                  <TitleBadge titleKey={profile?.title} size="sm" />
                  {((profile?.traits as string[] | undefined) || []).length > 0 && (
                    <div className="flex flex-row flex-wrap justify-center gap-1.5">
                      {((profile?.traits as string[] | undefined) || []).map((t) => {
                        const neg = isNegativeTrait(t)
                        return (
                          <span
                            key={t}
                            className={`px-2 py-0.5 rounded-md text-base border ${
                              neg ? 'bg-destructive/30 text-white border-destructive/60' : 'bg-white/20 text-white border-white/40'
                            }`}
                          >
                            {t}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {skills.filter((ms) => ms.equipped && ms.skill).length > 0 && (
                    <div className="flex flex-row flex-wrap justify-center gap-1.5">
                      {skills
                        .filter((ms) => ms.equipped && ms.skill)
                        .map((ms) => {
                          const s = ms.skill!
                          const r = RARITY_STYLES[s.rarity || 'bronze']
                          return (
                            <span
                              key={ms.id}
                              className={`px-2 py-0.5 rounded-md text-base ${
                                s.kind === 'skill' ? r.badgeCls : `${r.ringCls} border border-current`
                              }`}
                            >
                              {s.name}
                            </span>
                          )
                        })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center justify-center shrink-0">
                  <FootPrints foot={profile?.preferred_foot} mainSkill={profile?.foot_skill} weakSkill={profile?.weak_foot_skill} />
                </div>
              </div>
            </div>
          </div>

          {/* 导出球星卡海报（成长面板上方） */}
          <button
            type="button"
            className={`flex items-center justify-center leading-none break-keep rounded-xl ${showPoster ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
            onClick={() => setShowPoster(true)}
          >
            <div className="w-full py-3 flex items-center justify-center gap-2">
              <div className="i-mdi-export-variant text-2xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground">导出球星卡</span>
            </div>
          </button>

          {/* 成长面板：经验 / 活跃度 / 属性点 */}
          <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="i-mdi-chart-line text-2xl text-primary" />
              <h2 className="font-heading text-2xl text-foreground">成长面板</h2>
              <span className="text-base text-muted-foreground ml-auto">{levelDef.name} · Lv.{levelDef.level}</span>
            </div>

            {/* 经验进度 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-lg text-foreground">经验值 EXP</span>
                <span className="text-lg text-muted-foreground">
                  {exp % growthCfg.exp_per_level}/{growthCfg.exp_per_level}
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-gold rounded-full transition-all"
                  style={{width: `${expProgressPct(exp)}%`}}
                />
              </div>
              <p className="text-base text-muted-foreground">
                经验等级 {expLevelNum} · 每出勤1场 +{growthCfg.exp_per_match} EXP · 每升1级得 {growthCfg.points_per_level} 属性点
              </p>
              <p className="text-base text-muted-foreground">
                额外奖励：MVP +{growthCfg.mvp_exp}/{growthCfg.mvp_activity} · 最佳防守 +{growthCfg.defender_exp}/{growthCfg.defender_activity} · 每球 +{growthCfg.goal_exp}/{growthCfg.goal_activity} · 每助攻 +{growthCfg.assist_exp}/{growthCfg.assist_activity}（经验/活跃度）
              </p>
            </div>

            {/* 可用属性点 */}
            <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-star-four-points text-2xl text-primary" />
                <span className="text-xl text-foreground">可用属性点</span>
              </div>
              <span className="font-heading text-3xl text-primary">{freePoints}</span>
            </div>

            {/* 能力上限提示 */}
            <div className="flex items-center gap-2">
              <div className="i-mdi-lock-outline text-lg text-muted-foreground" />
              <p className="text-base text-muted-foreground">
                当前能力上限 {cap}（基础 75 · 每出勤 {APPEARANCES_PER_CAP} 场 +1 · 满分 99 · 已出勤 {appearances} 场）
              </p>
            </div>
          </div>

          {/* 六维加点 */}
          <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="i-mdi-tune-vertical text-2xl text-primary" />
                <h2 className="font-heading text-2xl text-foreground">六维加点</h2>
              </div>
              <span className="text-base text-muted-foreground">基础+技能 · 上限 {cap}</span>
            </div>
            {ABILITY_DIMENSIONS.map((d) => {
              const baseV = base[d.key] ?? 50
              const bonusV = bonuses[d.key] || 0
              const finalV = final[d.key]
              const atCap = baseV >= cap
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <div className={`${d.icon} text-2xl text-primary w-7`} />
                  <span className="text-lg text-foreground w-12">{d.label}</span>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tier.barCls}`}
                        style={{width: `${Math.min(100, (finalV / 99) * 100)}%`}}
                      />
                    </div>
                    {bonusV > 0 && (
                      <span className="text-sm text-primary">含技能加成 +{bonusV}</span>
                    )}
                  </div>
                  <span className="font-heading text-xl text-foreground w-12 text-right">{finalV}</span>
                  <div className="flex flex-row items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg ${baseV > 60 ? 'bg-muted' : 'bg-muted/40'}`}
                      onClick={() => handleAlloc(d.key, -1)}
                    >
                      <div className={`text-2xl ${baseV > 60 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                        {allocating === d.key ? '…' : '-'}
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg ${freePoints > 0 && !atCap ? 'bg-primary' : 'bg-muted/40'}`}
                      onClick={() => handleAlloc(d.key, 1)}
                    >
                      <div className={`text-2xl ${freePoints > 0 && !atCap ? 'text-primary-foreground' : 'text-muted-foreground/40'}`}>
                        {allocating === d.key ? '…' : '+'}
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
            <p className="text-base text-muted-foreground">
              基础值 60 · 加点消耗自由属性点 · 减点（不低于60）可回收自由属性点
            </p>
          </div>

          {/* 已装备 FIFA PlayStyles */}
          {skills.length > 0 && (
            <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-lightning-bolt-circle text-2xl text-primary" />
                <h2 className="font-heading text-2xl text-foreground">已装备 PlayStyles</h2>
              </div>
              <div className="flex flex-row flex-wrap gap-2">
                {skills
                  .filter((ms) => ms.equipped && ms.skill)
                  .sort((a, b) => ((a.skill?.kind === 'skill' ? 0 : 1) - (b.skill?.kind === 'skill' ? 0 : 1)))
                  .map((ms) => {
                    const s = ms.skill!
                    const r = RARITY_STYLES[s.rarity || 'bronze']
                    return (
                      <span key={ms.id} className={`px-3 py-1.5 rounded-md text-base ${r.badgeCls}`}>
                        {s.kind === 'skill' ? '技能' : '特性'} · {s.name}
                      </span>
                    )
                  })}
              </div>
            </div>
          )}

          {/* 技能加成入口 */}
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-card"
            onClick={() => Taro.navigateTo({url: '/pages/fifa-skills/index'})}
          >
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-lightning-bolt-circle text-2xl text-primary" />
              <span className="text-xl text-primary">特性与技能 · 装备获取加成</span>
            </div>
          </button>

          {/* 装备系统入口 */}
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
            onClick={() => Taro.navigateTo({url: '/pages/equipment/index'})}
          >
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-treasure-chest text-2xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground font-medium">
                装备系统 · 活跃度 {activityPoints}
              </span>
            </div>
          </button>

          {/* 当前装备概览 */}
          {equipment.some((e) => e.equipped) && (
            <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-tshirt-crew text-2xl text-primary" />
                <h2 className="font-heading text-2xl text-foreground">已装备装备</h2>
              </div>
              <div className="flex flex-row flex-wrap gap-2">
                {equipment
                  .filter((e) => e.equipped && e.equipment)
                  .map((e) => {
                    const eff = e.equipment?.effect
                    const effLabel = eff ? EQUIPMENT_EFFECTS[eff]?.label : ''
                    return (
                      <span key={e.id} className="px-3 py-1.5 rounded-md text-base tier-gold text-slate-900">
                        {e.equipment?.name}
                        {effLabel ? ` · ${effLabel}` : ''}
                      </span>
                    )
                  })}
              </div>
            </div>
          )}

          <p className="text-base text-muted-foreground text-center">
            六维基础值通过出勤升级加点提升，装备/技能/等级可获额外加成
          </p>
        </div>
      </div>

      {/* 球星卡海报导出弹层 */}
      <PlayerPoster visible={showPoster} member={profile} onClose={() => setShowPoster(false)} />
    </div>
  )
}

export default withRouteGuard(AbilityPage)
