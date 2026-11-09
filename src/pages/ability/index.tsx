// @title 球星卡

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {ScrollView, View} from '@tarojs/components'
import {Avatar, CachedAvatarImage} from '@/components/Avatar'
import {FootPrints} from '@/components/FootPrints'
import {LogoBg} from '@/components/LogoBg'
import {PlayerPoster} from '@/components/PlayerPoster'
import RadarChart from '@/components/RadarChart'
import {withRouteGuard} from '@/components/RouteGuard'
import {TitleBadge} from '@/components/TitleBadge'
import {
  ABILITY_DIMENSIONS,
  BASE_ABILITY_TOTAL,
  type AbilityKey,
  abilitiesWithBonus,
  abilityCapsOf,
  cardTier,
  DEFAULT_ABILITY,
  EQUIPMENT_EFFECTS,
  equipmentBonuses,
  expLevelProgress,
  getGrowthConfig,
  isNegativeTrait,
  levelBonuses,
  levelFromActivity,
  MAX_BASE_ABILITY,
  mergeBonuses,
  MIN_BASE_ABILITY,
  overallAbility,
  RARITY_STYLES,
  skillBonuses
} from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {
  allocPoints,
  getMyAbilityAllocation,
  getMyEquipment,
  getMyMemberSkills,
  saveAbilityBase
} from '@/db/api'
import type {AbilityAllocation, MemberEquipment, MemberSkill} from '@/db/types'

type AllocationValues = AbilityAllocation['allocated']
type BaseValues = AbilityAllocation['base']

function allocationTotal(values: AllocationValues | null): number {
  if (!values) return 0
  return ABILITY_DIMENSIONS.reduce((sum, {key}) => sum + values[key], 0)
}

function baseTotal(values: BaseValues): number {
  return ABILITY_DIMENSIONS.reduce((sum, {key}) => sum + values[key], 0)
}

function baseSignature(values: BaseValues): string {
  return ABILITY_DIMENSIONS.map(({key}) => values[key]).join(',')
}

function AbilityPage() {
  const {profile, refreshProfile} = useAuth()
  const [skills, setSkills] = useState<MemberSkill[]>([])
  const [equipment, setEquipment] = useState<MemberEquipment[]>([])
  const [allocation, setAllocation] = useState<AbilityAllocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [bonusSourcesReady, setBonusSourcesReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [allocating, setAllocating] = useState<AbilityKey | null>(null)
  const [baseEditorOpen, setBaseEditorOpen] = useState(false)
  const [baseEditorPresent, setBaseEditorPresent] = useState(false)
  const [baseSheetOn, setBaseSheetOn] = useState(false)
  const [baseDraft, setBaseDraft] = useState<BaseValues | null>(null)
  const [baseDraftSource, setBaseDraftSource] = useState<string | null>(null)
  const [baseEditorError, setBaseEditorError] = useState<string | null>(null)
  const [savingBase, setSavingBase] = useState(false)
  const allocationPending = useRef(false)
  const loadPending = useRef(true)
  const [growthCfg, setGrowthCfg] = useState(() => getGrowthConfig())
  const [showPoster, setShowPoster] = useState(false)
  useEffect(() => {
    // 队长后台可能已更新成长数值，进页时同步
    setGrowthCfg(getGrowthConfig())
  }, [])

  useEffect(() => {
    if (baseEditorOpen) {
      setBaseEditorPresent(true)
      const enter = setTimeout(() => setBaseSheetOn(true), 20)
      return () => clearTimeout(enter)
    }
    setBaseSheetOn(false)
    const leave = setTimeout(() => {
      setBaseEditorPresent(false)
      setBaseDraft(null)
      setBaseDraftSource(null)
      setBaseEditorError(null)
    }, 320)
    return () => clearTimeout(leave)
  }, [baseEditorOpen])

  useEffect(() => {
    if (!baseEditorPresent) return
    void Taro.hideTabBar({animation: false}).catch((error) => console.warn('Failed to hide tab bar:', error))
    return () => {
      void Taro.showTabBar({animation: false}).catch((error) => console.warn('Failed to restore tab bar:', error))
    }
  }, [baseEditorPresent])

  const loadData = useCallback(async () => {
    if (allocationPending.current) return
    loadPending.current = true
    setLoading(true)
    setLoadError(null)
    try {
      const [ms, eq, result] = await Promise.all([
        getMyMemberSkills(),
        getMyEquipment(),
        getMyAbilityAllocation()
      ])
      if (!result.ok || !result.data) {
        setAllocation(null)
        setBonusSourcesReady(false)
        setBaseEditorOpen(false)
        setBaseDraft(null)
        setBaseDraftSource(null)
        setLoadError(result.message || '属性分配加载失败，请重试')
        return
      }
      setSkills(ms)
      setEquipment(eq)
      setBonusSourcesReady(true)
      setAllocation(result.data)
    } catch (err) {
      console.error('Failed to load ability data:', err)
      setAllocation(null)
      setBonusSourcesReady(false)
      setBaseEditorOpen(false)
      setBaseDraft(null)
      setBaseDraftSource(null)
      setLoadError('属性分配加载失败，请检查网络后重试')
    } finally {
      loadPending.current = false
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    void refreshProfile()
    void loadData()
  })

  const skillBonusMap = useMemo(() => skillBonuses(skills), [skills])
  const equipBonusMap = useMemo(() => equipmentBonuses(equipment), [equipment])
  const levelBonusMap = useMemo(() => levelBonuses(profile?.activity ?? 0), [profile?.activity])
  const bonuses = useMemo(
    () => mergeBonuses(skillBonusMap, equipBonusMap, levelBonusMap),
    [skillBonusMap, equipBonusMap, levelBonusMap]
  )
  const abilitiesBeforeBonus = useMemo(() => {
    return Object.fromEntries(
      ABILITY_DIMENSIONS.map(({key}) => [
        key,
        allocation ? allocation.base[key] + allocation.allocated[key] : DEFAULT_ABILITY
      ])
    ) as Record<AbilityKey, number>
  }, [allocation])
  const final = useMemo(() => abilitiesWithBonus(abilitiesBeforeBonus, bonuses), [abilitiesBeforeBonus, bonuses])
  const ovr = useMemo(() => overallAbility(final), [final])
  const tier = useMemo(() => cardTier(ovr), [ovr])
  const savedTotal = allocationTotal(allocation?.allocated ?? null)
  const currentBaseTotal = allocation ? baseTotal(allocation.base) : 0
  const freePoints = allocation?.free_points ?? 0
  const budgetRemaining = allocation ? allocation.budget - savedTotal : 0
  const activityPoints = profile?.activity ?? 0
  const exp = profile?.exp ?? 0
  const levelDef = levelFromActivity(profile?.activity ?? 0)
  const expProgress = expLevelProgress(exp)
  const baseDraftTotal = baseDraft ? baseTotal(baseDraft) : 0
  const baseDraftCaps = useMemo(
    () => baseDraft && allocation ? abilityCapsOf(allocation.appearances, baseDraft) : null,
    [baseDraft, allocation]
  )
  const baseDraftValuesValid = baseDraft
    ? ABILITY_DIMENSIONS.every(
        ({key}) => Number.isInteger(baseDraft[key]) && baseDraft[key] >= MIN_BASE_ABILITY && baseDraft[key] <= MAX_BASE_ABILITY
      )
    : false
  const baseDraftValid = baseDraftValuesValid && baseDraftTotal === BASE_ABILITY_TOTAL
  const baseDraftChanged = baseDraft && allocation
    ? ABILITY_DIMENSIONS.some(({key}) => baseDraft[key] !== allocation.base[key])
    : false
  const baseDraftSourceCurrent = allocation ? baseDraftSource === baseSignature(allocation.base) : false

  const posterMember = useMemo(() => {
    if (!profile || !allocation) return null
    const savedAbilities = Object.fromEntries(
      ABILITY_DIMENSIONS.map(({key}) => [key, allocation.base[key] + allocation.allocated[key]])
    ) as Record<AbilityKey, number>
    return {
      ...profile,
      preferred_position: allocation.position,
      ...savedAbilities,
      member_skills: skills,
      member_equipment: equipment.map((item) => ({
        id: item.id,
        equipped: item.equipped,
        equipment: item.equipment ? {bonuses: item.equipment.bonuses} : null
      }))
    }
  }, [allocation, equipment, profile, skills])

  const loadLatestAllocation = async (fallbackMessage: string): Promise<AbilityAllocation | null> => {
    try {
      const latest = await getMyAbilityAllocation()
      if (latest.ok && latest.data) {
        setAllocation(latest.data)
        setLoadError(null)
        return latest.data
      }
      setAllocation(null)
      setBonusSourcesReady(false)
      setBaseEditorOpen(false)
      setBaseDraft(null)
      setBaseDraftSource(null)
      setLoadError(latest.message || fallbackMessage)
    } catch (err) {
      console.error('Failed to reload ability allocation:', err)
      setAllocation(null)
      setBonusSourcesReady(false)
      setBaseEditorOpen(false)
      setBaseDraft(null)
      setBaseDraftSource(null)
      setLoadError(fallbackMessage)
    }
    return null
  }

  const openBaseEditor = () => {
    if (!allocation || loadPending.current || loading || loadError || allocationPending.current) return
    setBaseDraft({...allocation.base})
    setBaseDraftSource(baseSignature(allocation.base))
    setBaseEditorError(null)
    setBaseEditorOpen(true)
  }

  const closeBaseEditor = () => {
    if (savingBase) return
    setBaseEditorOpen(false)
  }

  const adjustBaseDraft = (key: AbilityKey, delta: -1 | 1) => {
    if (savingBase) return
    setBaseDraft((current) => {
      if (!current) return current
      const next = current[key] + delta
      if (!Number.isInteger(next) || next < MIN_BASE_ABILITY || next > MAX_BASE_ABILITY) return current
      return {...current, [key]: next}
    })
    setBaseEditorError(null)
  }

  const handleAlloc = async (key: AbilityKey, delta: -1 | 1) => {
    if (!allocation || allocationPending.current || loadPending.current || loading || loadError) return
    const current = allocation.allocated[key]
    const currentAbility = allocation.base[key] + current
    if (delta < 0 && current <= 0) return
    if (delta > 0 && (currentAbility >= allocation.caps[key] || budgetRemaining <= 0 || freePoints <= 0)) return
    allocationPending.current = true
    setAllocating(key)
    try {
      const result = await allocPoints(key, delta)
      const latest = await loadLatestAllocation('属性状态同步失败，请重新载入后再操作')
      if (!latest) {
        Taro.showToast({title: result.ok ? '操作结果未确认，请重新载入' : result.message || '操作失败', icon: 'none'})
        return
      }
      void refreshProfile()
      const label = ABILITY_DIMENSIONS.find((dimension) => dimension.key === key)?.label
      Taro.showToast({title: result.ok ? `${delta > 0 ? '+' : '-'}1 ${label}` : result.message || '操作失败', icon: 'none'})
    } catch (err) {
      console.error('Failed to allocate ability point:', err)
      const recovered = await loadLatestAllocation('属性状态同步失败，请重新载入后再操作')
      if (recovered) void refreshProfile()
      Taro.showToast({title: '操作结果未确认，请重新载入', icon: 'none'})
    } finally {
      allocationPending.current = false
      setAllocating(null)
    }
  }

  const handleSaveBase = async () => {
    if (!allocation || !baseDraft || loadPending.current || loading || loadError) {
      setBaseEditorError('服务器属性状态不可用，请重新载入后再保存')
      return
    }
    if (!baseDraftSourceCurrent) {
      setBaseEditorError('服务器基础分配已更新，请取消后重新打开编辑器')
      return
    }
    if (!baseDraftValid) {
      setBaseEditorError(`每项须为 ${MIN_BASE_ABILITY}-${MAX_BASE_ABILITY} 的整数，且总分须为 ${BASE_ABILITY_TOTAL}`)
      return
    }
    if (!baseDraftChanged) {
      closeBaseEditor()
      return
    }
    if (allocationPending.current) {
      setBaseEditorError('另一项属性操作正在进行，请稍候')
      return
    }

    const submittedBase = {...baseDraft}
    allocationPending.current = true
    setSavingBase(true)
    setBaseEditorError(null)
    try {
      const result = await saveAbilityBase(submittedBase)
      if (!result.ok || !result.data) {
        const recovered = await loadLatestAllocation('基础分配保存失败，且服务器状态重新载入失败')
        if (recovered) {
          setBaseDraft({...recovered.base})
          setBaseDraftSource(baseSignature(recovered.base))
          setBaseEditorError(`${result.message || '基础分配保存失败'}；已重新载入服务器状态`)
          void refreshProfile()
        }
        Taro.showToast({title: result.message || '基础分配保存失败', icon: 'none'})
        return
      }
      setAllocation(result.data)
      setLoadError(null)
      setBaseEditorOpen(false)
      void refreshProfile()
      Taro.showToast({title: '基础分配已保存', icon: 'none'})
    } catch (err) {
      console.error('Failed to save base ability allocation:', err)
      const recovered = await loadLatestAllocation('基础分配结果未确认，且服务器状态重新载入失败')
      if (recovered) {
        setBaseDraft({...recovered.base})
        setBaseDraftSource(baseSignature(recovered.base))
        setBaseEditorError('保存结果未确认；已重新载入服务器状态')
        void refreshProfile()
      }
      Taro.showToast({title: '保存结果未确认，请查看重新载入的状态', icon: 'none'})
    } finally {
      allocationPending.current = false
      setSavingBase(false)
    }
  }

  const reloadAllocation = async () => {
    if (loading || loadPending.current || allocationPending.current) return
    await Promise.all([loadData(), refreshProfile()])
  }

  return (
    <div className="h-screen bg-background flex flex-col relative">
      <LogoBg />
      <div className={`flex-1 min-h-0 ${baseEditorPresent ? 'overflow-hidden' : 'overflow-y-auto'} pb-8 relative z-10`}>
        {/* 页头 */}
        <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
          <h1 className="font-heading text-3xl text-primary-foreground">我的球星卡</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="i-mdi-card-account-details-star-outline text-2xl text-primary-foreground/80" />
            <p className="text-xl text-primary-foreground/80">出勤涨经验 · 升级得点 · 加点变强</p>
          </div>
        </div>

        <div className="px-5 -mt-6 flex flex-col gap-4">
          {loading && !allocation && (
            <div className="bg-card rounded-2xl gold-frame p-6 flex items-center justify-center gap-2">
              <div className="i-mdi-loading animate-spin text-2xl text-primary" />
              <span className="text-xl text-muted-foreground">正在加载属性分配…</span>
            </div>
          )}
          {loadError && (
            <div className="bg-destructive/10 border-2 border-destructive/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="i-mdi-alert-circle-outline text-2xl text-destructive shrink-0" />
              <span className="flex-1 text-lg text-destructive">{loadError}</span>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-card text-lg text-foreground shrink-0"
                onClick={() => void reloadAllocation()}
              >
                重试
              </button>
            </div>
          )}
          {allocation && bonusSourcesReady && (
            <>
          {/* FIFA 风球星卡实时预览（含全部组合加成） */}
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
                  <span className="text-base opacity-80">当前能力</span>
                  <span className="flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-black/25">
                    <div className={`${tier.icon} text-lg`} />
                    <span className="text-base">{tier.name}</span>
                  </span>
                  <span className="text-lg mt-1">{allocation.position || '未设置位置'}</span>
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
            disabled={allocating !== null || loading || !!loadError || !posterMember}
            className={`flex items-center justify-center leading-none break-keep rounded-xl ${
              allocating !== null || loading || loadError || !posterMember ? 'bg-primary/40' : showPoster ? 'bg-primary/50' : 'bg-primary lift-glow'
            }`}
            onClick={() => {
              if (!allocating && !loading && !loadError && posterMember) setShowPoster(true)
            }}
          >
            <div className="w-full py-3 flex items-center justify-center gap-2">
              <div className="i-mdi-export-variant text-2xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground">
                导出球星卡
              </span>
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
                  {expProgress.earned}/{expProgress.required}
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-gold rounded-full transition-all"
                  style={{width: `${expProgress.progressPct}%`}}
                />
              </div>
              <p className="text-base text-muted-foreground">
                经验 Lv.{expProgress.level} · 每出勤1场 +{growthCfg.exp_per_match} EXP · 每升1级得 {growthCfg.points_per_level} 属性点
              </p>
              <p className="text-base text-muted-foreground">
                额外奖励：MVP +{growthCfg.mvp_exp}/{growthCfg.mvp_activity} · 最佳防守 +{growthCfg.defender_exp}/{growthCfg.defender_activity} · 每球 +{growthCfg.goal_exp}/{growthCfg.goal_activity} · 每助攻 +{growthCfg.assist_exp}/{growthCfg.assist_activity}（经验/活跃度）
              </p>
            </div>

            {/* 可用成长点 */}
            <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-star-four-points text-2xl text-primary" />
                <span className="text-xl text-foreground">可用成长点</span>
              </div>
              <span className="font-heading text-3xl text-primary">{freePoints}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="i-mdi-lock-outline text-lg text-muted-foreground" />
              <p className="text-base text-muted-foreground">
                {allocation.position || '未设置位置'} · 已出勤 {allocation.appearances} 场 · 分项成长上限仅随出勤提升
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
              <span className="text-base text-muted-foreground whitespace-nowrap">预算 {savedTotal}/{allocation.budget}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <span className="min-w-0 text-sm text-muted-foreground whitespace-nowrap">
                基础 {currentBaseTotal}/{BASE_ABILITY_TOTAL}
              </span>
              <button
                type="button"
                disabled={allocating !== null || loading || !!loadError || savingBase}
                className={`shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-base ${
                  allocating !== null || loading || loadError || savingBase
                    ? 'bg-muted text-muted-foreground/50'
                    : 'bg-primary/10 text-primary'
                }`}
                onClick={openBaseEditor}
              >
                <span>基础分配</span>
                <div className="i-mdi-pencil-outline text-lg" />
              </button>
            </div>
            {ABILITY_DIMENSIONS.map((d) => {
              const abilityV = abilitiesBeforeBonus[d.key]
              const bonusV = final[d.key] - abilityV
              const finalV = final[d.key]
              const atCap = abilityV >= allocation.caps[d.key]
              const canDecrease = allocating === null && !savingBase && !loading && !loadError && allocation.allocated[d.key] > 0
              const canIncrease = allocating === null && !savingBase && !loading && !loadError && freePoints > 0 && budgetRemaining > 0 && !atCap
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
                    {bonusV !== 0 && (
                      <span className="text-sm text-primary">含加成 {bonusV > 0 ? '+' : ''}{bonusV}</span>
                    )}
                  </div>
                  <span className="font-heading text-xl text-foreground w-12 text-right">{finalV}</span>
                  <div className="flex flex-row items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={!canDecrease}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg ${canDecrease ? 'bg-muted' : 'bg-muted/40'}`}
                      onClick={() => void handleAlloc(d.key, -1)}
                    >
                      <div className={`text-2xl ${canDecrease ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                        {allocating === d.key ? '…' : '-'}
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={!canIncrease}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg ${canIncrease ? 'bg-primary' : 'bg-muted/40'}`}
                      onClick={() => void handleAlloc(d.key, 1)}
                    >
                      <div className={`text-2xl ${canIncrease ? 'text-primary-foreground' : 'text-muted-foreground/40'}`}>
                        {allocating === d.key ? '…' : '+'}
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}

            <p className="text-base text-muted-foreground">
              基础 + 成长 + 生效加成（最高99）· 减号只回收已加成长点
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
            出勤提升六维成长上限，技能、装备与活跃等级加成合并后计入最终总评
          </p>
            </>
          )}
        </div>
      </div>

      {/* 球星卡海报导出弹层 */}
      <PlayerPoster visible={showPoster} member={posterMember} onClose={() => setShowPoster(false)} />

      {/* 固定基础分配弹层 */}
      {baseEditorPresent && allocation && baseDraft && (
        <View className="fixed inset-0 z-[9999] flex items-end" catchMove>
          <View className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${baseSheetOn ? 'opacity-100' : 'opacity-0'}`} catchMove onClick={closeBaseEditor} />
          <View
            role="dialog"
            aria-modal="true"
            aria-label="固定基础分配"
            className={`relative w-full bg-card rounded-t-3xl overflow-hidden transition-transform duration-300 ease-out ${baseSheetOn ? 'translate-y-0' : 'translate-y-full'}`}
            catchMove
          >
            <ScrollView scrollY enhanced bounces={false} style={{height: '85vh', overscrollBehavior: 'contain'}}>
            <div className="px-5 pt-5 pb-8 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-2xl text-foreground">固定基础分配</h3>
                <p className="mt-1 text-base text-muted-foreground">
                  基础按首次设置的位置自动初始化，可自行调整；总分固定 {BASE_ABILITY_TOTAL}，成长点另行计算。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭基础分配"
                disabled={savingBase}
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                  savingBase ? 'bg-muted/50 text-muted-foreground/40' : 'bg-muted text-foreground'
                }`}
                onClick={closeBaseEditor}
              >
                <div className="i-mdi-close text-2xl" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {ABILITY_DIMENSIONS.map((dimension) => {
                const value = baseDraft[dimension.key]
                const canLower = !savingBase && value > MIN_BASE_ABILITY
                const canRaise = !savingBase && value < MAX_BASE_ABILITY
                return (
                  <div key={dimension.key} className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2">
                    <div className={`${dimension.icon} text-2xl text-primary w-7 shrink-0`} />
                    <div className="w-12 shrink-0 flex flex-col">
                      <span className="text-lg text-foreground">{dimension.label}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">上限 {baseDraftCaps?.[dimension.key]}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label={`${dimension.label}基础值减一`}
                        disabled={!canLower}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-2xl ${
                          canLower ? 'bg-muted text-foreground' : 'bg-muted/40 text-muted-foreground/40'
                        }`}
                        onClick={() => adjustBaseDraft(dimension.key, -1)}
                      >
                        -
                      </button>
                      <span className="font-heading text-2xl text-foreground w-12 text-center">{value}</span>
                      <button
                        type="button"
                        aria-label={`${dimension.label}基础值加一`}
                        disabled={!canRaise}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-2xl ${
                          canRaise ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground/40'
                        }`}
                        onClick={() => adjustBaseDraft(dimension.key, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={`rounded-xl border-2 px-4 py-3 ${
              baseDraftValid ? 'border-primary/30 bg-primary/5' : 'border-destructive/40 bg-destructive/10'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg text-foreground">固定基础总分</span>
                <span className={`font-heading text-2xl ${baseDraftValid ? 'text-primary' : 'text-destructive'}`}>
                  {baseDraftTotal}/{BASE_ABILITY_TOTAL}
                </span>
              </div>
              <p className={`mt-1 text-base ${baseDraftValuesValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                每项必须是 {MIN_BASE_ABILITY}-{MAX_BASE_ABILITY} 的整数，总分必须正好为 {BASE_ABILITY_TOTAL}
              </p>
            </div>

            <div className={`rounded-xl px-4 py-3 flex items-start gap-2 ${
              baseDraftChanged ? 'bg-amber-500/10' : 'bg-muted/50'
            }`}>
              <div className={`${baseDraftChanged ? 'i-mdi-alert-outline text-amber-600' : 'i-mdi-information-outline text-muted-foreground'} text-xl shrink-0 mt-0.5`} />
              <p className={`text-base ${baseDraftChanged ? 'text-amber-700' : 'text-muted-foreground'}`}>
                {baseDraftChanged
                  ? savedTotal > 0
                    ? `保存更改后，当前 ${savedTotal} 点成长加点将重置，并全部退回为可用成长点。`
                    : '保存更改会重置成长加点；当前没有已加成长点。'
                  : '基础分配未更改，保存或取消都不会重置成长加点。'}
              </p>
            </div>

            {!baseDraftSourceCurrent && (
              <p className="text-base text-destructive">服务器基础分配已更新，请取消后重新打开编辑器。</p>
            )}
            {baseEditorError && <p className="text-base text-destructive">{baseEditorError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={savingBase}
                className={`flex-1 rounded-xl py-3 text-xl ${
                  savingBase ? 'bg-muted/50 text-muted-foreground/40' : 'bg-muted text-foreground'
                }`}
                onClick={closeBaseEditor}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingBase || !baseDraftValid || !baseDraftSourceCurrent || loading || !!loadError}
                className={`flex-1 rounded-xl py-3 text-xl ${
                  savingBase || !baseDraftValid || !baseDraftSourceCurrent || loading || loadError
                    ? 'bg-primary/40 text-primary-foreground/70'
                    : 'bg-primary text-primary-foreground'
                }`}
                onClick={() => void handleSaveBase()}
              >
                {savingBase ? '保存中…' : '保存'}
              </button>
            </div>
            </div>
            </ScrollView>
          </View>
        </View>
      )}
    </div>
  )
}

export default withRouteGuard(AbilityPage)
