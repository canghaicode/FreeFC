// @title 我的
import {useCallback, useEffect, useRef, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {Avatar} from '@/components/Avatar'
import {getMyAllMatchStats, getPendingTacticCount, getSeasons, getSquadMember, getUserSeasonStats} from '@/db/api'
import type {Profile as ProfileRow, Season, SeasonStatsRow} from '@/db/types'
import {POSITION_ICONS, memberFinalAbilities, overallAbility, cardTier, levelFromActivity, levelProgress, homeTeamOf} from '@/constants'

function Profile() {
  const {user, profile, signOut} = useAuth()
  const [myStats, setMyStats] = useState<SeasonStatsRow | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [reportedCount, setReportedCount] = useState(0)
  const [pendingTacticCount, setPendingTacticCount] = useState(0)
  const [abilityMember, setAbilityMember] = useState<ProfileRow | null>(null)
  const [abilityLoading, setAbilityLoading] = useState(true)
  const [abilityError, setAbilityError] = useState(false)

  const loadedUserId = useRef<string | null | undefined>(undefined)
  const userRef = useRef(user)
  userRef.current = user
  const loadData = useCallback(async () => {
    const currentUser = userRef.current
    setAbilityLoading(true)
    setAbilityError(false)
    try {
      const [seasonList, allStats, pendingTactics, mySeasonStats, fullAbilityMember] = await Promise.all([
        getSeasons().catch(() => []),
        getMyAllMatchStats().catch(() => []),
        getPendingTacticCount().catch(() => 0),
        currentUser ? getUserSeasonStats(currentUser.id).catch(() => []) : Promise.resolve([]),
        currentUser ? getSquadMember(currentUser.id).catch(() => null) : Promise.resolve(null)
      ])
      setSeasons(seasonList)
      setReportedCount(allStats.length)
      setPendingTacticCount(pendingTactics)
      const active = seasonList.find((season) => season.is_active) || seasonList[0]
      const stats = (mySeasonStats ?? []) as SeasonStatsRow[]
      setMyStats(active ? stats.find((row) => row.season_id === active.id) || null : null)
      setAbilityMember(fullAbilityMember)
      setAbilityError(!!currentUser && !fullAbilityMember)
    } catch (err) {
      console.error('Failed to load profile data:', err)
      setAbilityMember(null)
      setAbilityError(!!currentUser)
    } finally {
      setAbilityLoading(false)
    }
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

  const handleLogout = async () => {
    const res = await Taro.showModal({title: '退出登录', content: '确定退出当前账号吗？'})
    if (!res.confirm) return
    await signOut()
    Taro.reLaunch({url: '/pages/login/index'})
  }

  const ability = abilityMember ? overallAbility(memberFinalAbilities(abilityMember)) : null
  const preferredPosition = (profile?.preferred_position as string | null) ?? null
  const secondaryPosition = (profile?.secondary_position as string | null) ?? null
  const activeSeason = seasons.find((s) => s.is_active) || seasons[0]
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 个人卡 */}
      <div className="bg-gradient-primary px-5 pt-12 pb-14 rounded-b-[2.5rem]">
        <div className="flex items-center gap-4">
          <Avatar url={profile?.avatar_url as string | null} name={profile?.nickname as string | null} size="lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-heading text-3xl text-primary-foreground truncate">
                {(profile?.nickname as string) || '未设置昵称'}
              </span>
              {isAdmin && (
                <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-lg">队长</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl text-primary-foreground/80">
                {(profile?.username as string) || '队员'}
              </span>
              {(profile?.jersey_number as number) !== null && (profile?.jersey_number as number) !== undefined && (
                <span className="px-2 py-0.5 rounded-md bg-primary-foreground/20 text-primary-foreground text-lg">
                  #{profile?.jersey_number as number}
                </span>
              )}
              {preferredPosition && (
                <span className="flex items-center gap-1 text-xl text-primary-foreground/80">
                  <div className={`${POSITION_ICONS[preferredPosition] || 'i-mdi-soccer'} text-xl`} />
                  {preferredPosition}
                </span>
              )}
              {secondaryPosition && (
                <span className="text-lg text-primary-foreground/60">/ {secondaryPosition}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-6 flex flex-col gap-4">
        {/* 等级 / 活跃度面板 */}
        {(() => {
          const def = levelFromActivity(profile?.activity ?? 0)
          const prog = levelProgress(profile?.activity ?? 0)
          const team = homeTeamOf(profile?.home_team ?? null)
          return (
            <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-secondary/40 flex items-center justify-center shrink-0`}>
                  <div className={`${def.icon} text-3xl ${def.color}`} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="font-heading text-2xl text-foreground">Lv.{def.level} {def.name}</span>
                  <span className="text-lg text-muted-foreground">活跃度 {profile?.activity ?? 0}</span>
                </div>
                {team && (
                  <div className="flex flex-col items-end shrink-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center border-2 border-border/40"
                      style={{backgroundColor: team.color}}
                    >
                      <span className="font-heading text-base text-primary-foreground">{team.short}</span>
                    </div>
                    <span className="text-base text-muted-foreground mt-1">{team.short}</span>
                  </div>
                )}
              </div>
              <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-primary rounded-full" style={{width: `${prog}%`}} />
              </div>
              <p className="text-base text-muted-foreground">
                {def.level >= 5 ? '已达最高等级 · 传奇名宿' : `距下一级还需 ${def.max + 1 - (profile?.activity ?? 0)} 活跃度`}
              </p>
            </div>
          )
        })()}

        {/* 能力值 + 本赛季数据 */}
        <div className="bg-card rounded-2xl gold-frame p-5 flex flex-row items-center">
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="font-heading text-4xl text-primary">{abilityLoading ? '…' : ability ?? '--'}</span>
            <span className="text-lg text-muted-foreground">{abilityError ? '能力加载失败' : '能力总评'}</span>
          </div>
          <div className="w-px h-14 bg-border" />
          <div className="flex-[3] flex flex-row justify-around">
            <div className="flex flex-col items-center gap-1">
              <span className="font-heading text-3xl text-foreground">{myStats?.appearances ?? 0}</span>
              <span className="text-lg text-muted-foreground">出场</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-heading text-3xl text-foreground">{myStats?.goals ?? 0}</span>
              <span className="text-lg text-muted-foreground">进球</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-heading text-3xl text-foreground">{myStats?.assists ?? 0}</span>
              <span className="text-lg text-muted-foreground">助攻</span>
            </div>
          </div>
        </div>

        {(myStats || activeSeason) && (
          <p className="text-lg text-muted-foreground text-center">
            统计赛季：{activeSeason?.name || '暂无'}
            {reportedCount > 0 ? ` · 已填报 ${reportedCount} 场数据` : ''}
          </p>
        )}

        {/* 功能列表 */}
        <div className="bg-card rounded-2xl gold-frame overflow-hidden flex flex-col">
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.switchTab({url: '/pages/ability/index'})}
          >
            <div className="i-mdi-chart-radar text-3xl text-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-xl text-foreground">我的球星卡</span>
              <p className="text-base text-muted-foreground mt-0.5">
                经验 {profile?.exp ?? 0} · 可用属性点 {profile?.free_points ?? 0}
              </p>
            </div>
            {(profile?.free_points ?? 0) > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-base text-primary shrink-0">
                可加点
              </span>
            )}
            {ability != null && (
              <span className={`px-2.5 py-1 rounded-lg ${cardTier(ability).badgeCls} font-heading text-lg`}>
                {ability}
              </span>
            )}
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/profile-edit/index'})}
          >
            <div className="i-mdi-account-edit-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">编辑个人资料</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/home-team/index'})}
          >
            <div className="i-mdi-shield-star-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">选择主队</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/fifa-skills/index'})}
          >
            <div className="i-mdi-star-shooting-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">特性与技能</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/equipment/index'})}
          >
            <div className="i-mdi-treasure-chest text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">装备系统</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/tactics-manage/index'})}
          >
            <div className="i-mdi-soccer-field text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">战术管理</span>
            {pendingTacticCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-destructive text-base text-white min-w-7 text-center">
                {pendingTacticCount}
              </span>
            )}
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/match-report/index'})}
          >
            <div className="i-mdi-clipboard-edit-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">填报比赛数据</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/parking-qr/index'})}
          >
            <div className="i-mdi-qrcode text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">锐博停车码</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          {/* // [compliance] M02 隐私政策查看入口 / M07 双清单查看入口 / M09 账号注销入口 */}
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/privacy-policy/index'})}
          >
            <div className="i-mdi-shield-lock-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">隐私政策</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/privacy-inventory/index'})}
          >
            <div className="i-mdi-clipboard-list-outline text-3xl text-primary" />
            <span className="flex-1 text-xl text-foreground">隐私信息清单</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
            onClick={() => Taro.navigateTo({url: '/pages/account-delete/index'})}
          >
            <div className="i-mdi-account-remove-outline text-3xl text-destructive" />
            <span className="flex-1 text-xl text-foreground">账号注销</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
          {isAdmin && (
            <div
              className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
              onClick={() => Taro.navigateTo({url: '/pages/captain-admin/index'})}
            >
              <div className="i-mdi-account-cog-outline text-3xl text-primary" />
              <span className="flex-1 text-xl text-foreground">队长后台</span>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          )}
          {isAdmin && (
            <div
              className="flex items-center gap-3 p-4 border-b-2 border-border/50 active:bg-muted/50"
              onClick={() => Taro.navigateTo({url: '/pages/season-manage/index'})}
            >
              <div className="i-mdi-trophy-outline text-3xl text-primary" />
              <span className="flex-1 text-xl text-foreground">赛季管理</span>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          )}
          <div className="flex items-center gap-3 p-4 active:bg-muted/50" onClick={handleLogout}>
            <div className="i-mdi-logout text-3xl text-destructive" />
            <span className="flex-1 text-xl text-destructive">退出登录</span>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default withRouteGuard(Profile)
