// @title 球队成员

import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {Avatar} from '@/components/Avatar'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {LogoBg} from '@/components/LogoBg'
import {MemberDetailModal} from '@/components/MemberDetailModal'
import {withRouteGuard} from '@/components/RouteGuard'
import {TitleBadge} from '@/components/TitleBadge'
import {TraitTags} from '@/components/TraitTags'
import {
  CARD_TIERS,
  type CardTier,
  cardTier,
  footLabel,
  homeTeamOf,
  levelFromActivity,
  memberFinalAbilities,
  overallAbility,
  POSITION_ICONS
} from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {getSquad} from '@/db/api'
import type {Profile} from '@/db/types'

function StarCard() {
  const {user} = useAuth()
  const [members, setMembers] = useCachedState<Profile[]>('star-card-members', [])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('star-card')
  const [detailId, setDetailId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    startRefresh()
    try {
      const squad = await getSquad().catch(() => [])
      setMembers(squad)
    } catch (err) {
      console.error('Failed to load squad members:', err)
    } finally {
      finishRefresh()
    }
  }, [])
  useDidShow(() => {
    loadData()
  })

  const detail = useMemo(() => members.find((m) => m.id === detailId) ?? null, [members, detailId])
  const isSelf = detail && user && detail.id === user.id
  /** 最终六维：技能 + 装备 + 等级加成（与能力页统一口径） */
  const finalOf = useCallback((m: Profile) => memberFinalAbilities(m), [])
  /** 总评降序，未设置的排后面 */
  const sorted = useMemo(() => {
    return [...members].sort((a, b) => (overallAbility(finalOf(b)) ?? -1) - (overallAbility(finalOf(a)) ?? -1))
  }, [members, finalOf])
  /** 六维最高分卡（全场最佳六边形） */
  const topPlayer = useMemo(() => {
    return sorted.find((m) => overallAbility(finalOf(m)) !== null) ?? null
  }, [sorted, finalOf])

  /** 全队最高总评横幅：数据就绪后显示 1 秒自动隐藏 */
  const [bannerVisible, setBannerVisible] = useState(false)
  useEffect(() => {
    if (!topPlayer || overallAbility(finalOf(topPlayer)) === null) return
    setBannerVisible(true)
    const timer = setTimeout(() => setBannerVisible(false), 1000)
    return () => clearTimeout(timer)
  }, [topPlayer, finalOf])

  /** 按品质分档：传奇/黄金/白银/青铜/未评级，各档内总评降序 */
  const tierGroups = useMemo(() => {
    const groups: {tier: CardTier; members: Profile[]}[] = []
    for (const key of ['legend', 'gold', 'silver', 'bronze', 'unset'] as const) {
      const tier = CARD_TIERS[key]
      const list = sorted.filter((m) => cardTier(overallAbility(finalOf(m))).key === key)
      if (list.length > 0) groups.push({tier, members: list})
    }
    return groups
  }, [sorted, finalOf])

  const closeDetail = () => setDetailId(null)

  return (
    <div className="min-h-screen bg-background pb-8 relative">
      <LogoBg />
      <div className="relative z-10">
      {/* 头部 */}
      <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem] flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl text-primary-foreground">球队成员</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="i-mdi-account-group-outline text-2xl text-primary-foreground/80" />
            <p className="text-xl text-primary-foreground/80">
              {members.length > 0 ? `全队 ${members.length} 张球星卡` : '邀请队友完善球星卡'}
            </p>
          </div>
        </div>
        {/* 名单管理入口 */}
        <button
          type="button"
          className="flex items-center justify-center leading-none break-keep rounded-full bg-primary-foreground/20 active:bg-primary-foreground/30 shrink-0 mb-1"
          onClick={() => Taro.navigateTo({url: '/pages/squad/index'})}
        >
          <div className="px-4 py-2 flex items-center gap-1.5">
            <div className="i-mdi-account-multiple-outline text-2xl text-primary-foreground" />
            <span className="text-xl text-primary-foreground">名单</span>
          </div>
        </button>
      </div>

      {/* 卡片墙：按品质分档展示 */}
      <div className="px-5 -mt-6 flex flex-col gap-5">
        {loading && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}
        {!loading && sorted.length === 0 && (
          <div className="bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-card-bulleted-outline text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">还没有队员资料</p>
          </div>
        )}
        {!loading &&
          tierGroups.map((group, gIdx) => (
            <div key={group.tier.key} className={`flex flex-col gap-3 ${gIdx === 0 ? 'mt-8' : ''}`}>
              {/* 品质分组标题 */}
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${group.tier.badgeCls}`}>
                  <div className={`${group.tier.icon} text-xl`} />
                </div>
                <span className="font-heading text-2xl text-foreground">{group.tier.name}</span>
                <span className="text-lg text-muted-foreground">{group.members.length} 人</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {group.members.map((m, idx) => {
                const overall = overallAbility(finalOf(m))
                const tier = cardTier(overall)
                const levelDef = levelFromActivity(m.activity)
                const team = homeTeamOf(m.home_team)
                return (
                  <div
                    key={m.id}
                    className="relative bg-card rounded-2xl p-4 lift-glow slide-in-right overflow-hidden"
                    style={{animationDelay: `${Math.min(gIdx * 3 + idx, 12) * 60}ms`}}
                    onClick={() => setDetailId(m.id)}
                  >
                    {/* 品质竖条 */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${tier.barCls}`} />
                    <div className="flex items-center gap-3 pl-2">
                      <div className="relative">
                        <Avatar url={m.avatar_url} name={m.nickname} size="xl" />
                        {m.jersey_number != null && (
                          <span className="absolute -bottom-1 -right-2 px-1.5 py-0.5 rounded-md bg-primary text-lg text-primary-foreground font-heading">
                            {m.jersey_number}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading text-2xl text-foreground truncate">{m.nickname || '未命名队员'}</h3>
                          {m.role === 'admin' && (
                            <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-lg shrink-0">
                              队长
                            </span>
                          )}
                          <TitleBadge titleKey={m.title} size="sm" />
                          {m.id === user?.id && <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground text-lg">我</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {m.preferred_position && (
                            <span className="flex items-center gap-1 text-lg text-muted-foreground">
                              <div className={`${POSITION_ICONS[m.preferred_position] || 'i-mdi-soccer'} text-lg`} />
                              {m.preferred_position}
                            </span>
                          )}
                          {m.secondary_position && (
                            <span className="text-lg text-muted-foreground/70">/ {m.secondary_position}</span>
                          )}
                          <span className="flex items-center gap-0.5 text-lg text-muted-foreground">
                            <div className="i-mdi-shoe-print text-lg text-primary/70" />
                            {footLabel(m.preferred_foot)}
                          </span>
                          <span className="flex items-center gap-0.5 text-lg text-muted-foreground">
                            <div className={`${levelDef.icon} text-lg ${levelDef.color}`} />
                            Lv.{levelDef.level}
                          </span>
                          {team && (
                            <span className="px-1.5 py-0.5 rounded-md text-base" style={{backgroundColor: team.color, color: team.text}}>
                              {team.short}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* 总评徽章：品质联动 */}
                      <div className={`flex flex-col items-center rounded-xl px-3 py-2 ${tier.badgeCls}`}>
                        <span className="font-heading text-3xl leading-tight">{overall ?? '--'}</span>
                        <span className="text-sm opacity-80">总评</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
      </div>
      </div>

      {/* 详情弹层（共用组件，含球星海报） */}
      {detail && <MemberDetailModal member={detail} isSelf={!!isSelf} onClose={closeDetail} />}

      {/* 综合评分弹层 */}
      {/* 评分独立页：球星卡入口跳转 /pages/rating */}

      {/* 提示条：六维最高分队员横幅（常驻节点，透明度过渡淡入淡出） */}
      {topPlayer && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-30 bg-card/95 gold-frame rounded-full px-5 py-2.5 flex items-center gap-2 shadow-lg transition-all duration-300 ${
            bannerVisible && !detailId ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
          style={{bottom: '16rpx'}}
        >
          <div className="i-mdi-crown text-2xl" style={{color: '#C9A227'}} />
          <span className="text-lg text-foreground">
            全队最高总评 · {topPlayer.nickname || '神秘球员'}（{overallAbility(finalOf(topPlayer))}）
          </span>
        </div>
      )}

    </div>
  )
}
export default withRouteGuard(StarCard)
