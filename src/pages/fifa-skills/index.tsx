// @title 特性与技能
import {useCallback, useEffect, useRef, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {LogoBg} from '@/components/LogoBg'
import {getMemberSkills, getSkillCatalog, toggleSkillEquipped, unlockSkill, upgradeSkill} from '@/db/api'
import type {MemberSkill, SkillCatalog} from '@/db/types'
import {ABILITY_DIMENSIONS, RARITY_STYLES} from '@/constants'

function FifaSkills() {
  const {user, profile, refreshProfile} = useAuth()
  const [catalog, setCatalog] = useState<SkillCatalog[]>([])
  const [mine, setMine] = useState<MemberSkill[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('fifa-skills')
  const [actingId, setActingId] = useState<string | null>(null)

  const loadedUserId = useRef<string | null | undefined>(undefined)
  const userRef = useRef(user)
  userRef.current = user
  const loadData = useCallback(async () => {
    const currentUser = userRef.current
    if (!currentUser) return
    startRefresh()
    const [c, m] = await Promise.all([getSkillCatalog(), getMemberSkills(currentUser.id)])
    setCatalog(c)
    setMine(m)
    finishRefresh()
  }, [])

  useDidShow(() => {
    loadedUserId.current = userRef.current?.id ?? null
    loadData()
  })

  useEffect(() => {
    const userId = user?.id ?? null
    if (loadedUserId.current === undefined || loadedUserId.current === userId) return
    loadedUserId.current = userId
    loadData()
  }, [user?.id, loadData])

  const freePoints = profile?.free_points ?? 0
  const equippedTraits = mine.filter((m) => m.equipped && m.skill?.kind === 'trait')
  const equippedSkills = mine.filter((m) => m.equipped && m.skill?.kind === 'skill')

  const findMine = (skillId: string) => mine.find((m) => m.skill_id === skillId)

  const handleUnlock = async (s: SkillCatalog) => {
    if (actingId) return
    const cost = s.cost_points ?? 2
    const res = await Taro.showModal({title: '解锁确认', content: `消耗 ${cost} 能力点解锁「${s.name}」？`})
    if (!res.confirm) return
    setActingId(s.id)
    try {
      const result = await unlockSkill(s.id)
      Taro.showToast({title: result.message || (result.ok ? '解锁成功' : '解锁失败'), icon: result.ok ? 'success' : 'none'})
      if (result.ok) {
        await loadData()
        await refreshProfile()
      }
    } finally {
      setActingId(null)
    }
  }

  const handleUpgrade = async (s: SkillCatalog, curLevel: number) => {
    if (actingId) return
    const cost = s.cost_points ?? 2
    const next = curLevel + 1
    const res = await Taro.showModal({
      title: '升级确认',
      content: `消耗 ${cost} 能力点将「${s.name}」升至 Lv.${next}？${s.bonus_key && s.bonus_value ? `（加成提升至 +${s.bonus_value * next}）` : ''}`
    })
    if (!res.confirm) return
    setActingId(s.id)
    try {
      const result = await upgradeSkill(s.id)
      Taro.showToast({title: result.message || (result.ok ? '升级成功' : '升级失败'), icon: result.ok ? 'success' : 'none'})
      if (result.ok) {
        await loadData()
        await refreshProfile()
      }
    } finally {
      setActingId(null)
    }
  }

  const handleToggle = async (ms: MemberSkill) => {
    if (actingId || !ms.skill) return
    const next = !ms.equipped
    if (next) {
      const sameKindEquipped = mine.filter((m) => m.equipped && m.skill?.kind === ms.skill?.kind).length
      if (sameKindEquipped >= 2) {
        Taro.showToast({title: '已达装备上限', icon: 'none'})
        return
      }
    }
    setActingId(ms.skill_id)
    try {
      const result = await toggleSkillEquipped(ms.skill_id, next)
      Taro.showToast({title: result.ok ? (next ? '已装备' : '已卸下') : '操作失败', icon: result.ok ? 'success' : 'none'})
      if (result.ok) await loadData()
    } finally {
      setActingId(null)
    }
  }

  const renderCard = (s: SkillCatalog) => {
    const owned = findMine(s.id)
    const equipped = !!owned?.equipped
    const level = owned?.level ?? 1
    const maxLv = s.max_level || 3
    const maxed = level >= maxLv
    const costPoints = s.cost_points ?? 2
    const canAfford = freePoints >= costPoints
    const isTrait = s.kind === 'trait'
    const rarity = RARITY_STYLES[s.rarity || 'bronze']
    return (
      <div
        key={s.id}
        className={`bg-card rounded-2xl border-2 p-4 ring-1 ${rarity.ringCls} ${equipped ? 'border-primary' : 'border-border/60'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-base shrink-0 ${rarity.badgeCls}`}>
                {rarity.label} {rarity.star}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-base shrink-0 ${isTrait ? 'bg-violet-500/15 text-violet-500' : 'bg-sky-500/15 text-sky-500'}`}>
                {isTrait ? '特性' : '技能'}
              </span>
              {owned && (
                <span className={`px-2 py-0.5 rounded-md text-base shrink-0 ${maxed ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                  Lv.{level}/{maxLv}
                </span>
              )}
              <span className="text-xl text-foreground font-bold truncate">{s.name}</span>
            </div>
            <p className="text-lg text-muted-foreground mt-1 leading-relaxed">{s.description}</p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            {s.bonus_key && s.bonus_value > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-primary/15 text-base text-primary">
                {ABILITY_DIMENSIONS.find((d) => d.key === s.bonus_key)?.label} +{s.bonus_value * level}
                {!maxed && <span className="text-muted-foreground"> → +{s.bonus_value * maxLv}</span>}
              </span>
            )}
            <span className="text-2xl font-bold text-primary mt-1">{costPoints}</span>
            <span className="text-base text-muted-foreground">能力点/{maxed ? '满级' : '级'}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-row items-center gap-3">
          {!owned ? (
            <button
              type="button"
              className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${canAfford ? 'bg-primary lift-glow' : 'bg-muted'}`}
              onClick={() => handleUnlock(s)}
            >
              <div className="py-2.5 flex items-center gap-2">
                <div className="i-mdi-lock-open-variant-outline text-2xl text-primary-foreground" />
                <span className="text-xl text-primary-foreground">
                  {actingId === s.id ? '解锁中…' : canAfford ? '解锁' : '能力点不足'}
                </span>
              </div>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${equipped ? 'border-primary bg-primary/10' : 'border-muted bg-muted/40'}`}
                onClick={() => handleToggle(owned)}
              >
                <div className="py-2.5 flex items-center gap-1.5">
                  <div className={`${equipped ? 'i-mdi-check-circle text-primary' : 'i-mdi-circle-outline text-muted-foreground'} text-2xl`} />
                  <span className={`text-xl ${equipped ? 'text-primary' : 'text-muted-foreground'}`}>
                    {actingId === s.id ? '处理中…' : equipped ? '已装备' : '装备'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className={`w-36 flex items-center justify-center leading-none break-keep rounded-xl ${maxed ? 'bg-muted' : canAfford ? 'bg-gradient-gold lift-glow' : 'bg-muted'}`}
                onClick={() => (maxed ? undefined : handleUpgrade(s, level))}
              >
                <div className="py-2.5 flex items-center gap-1.5">
                  <div className={`text-2xl ${maxed ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                    <div className={maxed ? 'i-mdi-star-check-outline' : 'i-mdi-arrow-up-bold-box-outline'} />
                  </div>
                  <span className={`text-lg font-medium ${maxed ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                    {actingId === s.id ? '升级中…' : maxed ? '已满级' : `升 Lv.${level + 1}`}
                  </span>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8 relative">
      <LogoBg />
      <div className="relative z-10">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-2">
        <h1 className="font-heading text-3xl text-foreground">特性与技能</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="i-mdi-star-four-points text-2xl text-primary" />
            <span className="text-xl text-foreground font-bold">{freePoints}</span>
            <span className="text-lg text-muted-foreground">能力点</span>
          </div>
          <span className="text-lg text-muted-foreground">·</span>
          <span className="text-lg text-muted-foreground">特性 {equippedTraits.length}/2 · 技能 {equippedSkills.length}/2</span>
        </div>
        <p className="text-base text-muted-foreground">能力点通过升级与活跃度兑换获取 · 解锁/升级特性技能与属性加点共用同一能力点池</p>
      </div>

      {loading ? (
        <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>
      ) : (
        <div className="px-5 pt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <h3 className="font-heading text-2xl text-foreground">特性 Traits</h3>
            {catalog.filter((c) => c.kind === 'trait').map(renderCard)}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-heading text-2xl text-foreground">技能 Skills</h3>
            {catalog.filter((c) => c.kind === 'skill').map(renderCard)}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

export default withRouteGuard(FifaSkills)