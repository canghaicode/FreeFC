// @title 球队活动

import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {LogoBg} from '@/components/LogoBg'
import {withRouteGuard} from '@/components/RouteGuard'
import {formatActivityTime, MATCH_FORMATS} from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {getActivities, getActiveSeasonActivities, getKickRequests, getMyRegisteredActivityIds, hasOpenPolls} from '@/db/api'
import type {ActivityWithCount, KickRequest, Season} from '@/db/types'

// 蹲坑专区暂时下线；保留页面与实现，重新开放时只需切换此开关。
const SHOW_DUNKU_ENTRY = false
// 投票中心：对登录用户开放；未登录与 admin 账号不显示入口。
const SHOW_VOTE_CENTER_ENTRY = true


/** 参与队员人数（普通队员+队长，教练不占名额；含携带人数） */
function playerCount(a: ActivityWithCount) {
  return (
    a.regs?.
      filter((r) => r.seat_role !== 'coach')
      .reduce((sum, r) => sum + 1 + (r.guest_count || 0), 0) ?? 0
  )
}

/** 活动状态：已取消 / 已结束 / 已满员 / 报名中 */
function activityStatus(a: ActivityWithCount) {
  const count = playerCount(a)
  if (a.cancelled) {
    return {label: '已取消', cls: 'bg-destructive/10 text-destructive'}
  }
  if (new Date(a.activity_time).getTime() <= Date.now()) {
    return {label: '已结束', cls: 'bg-muted text-muted-foreground'}
  }
  if (count >= a.max_players) {
    return {label: '已满员', cls: 'bg-destructive/10 text-destructive'}
  }
  return {label: '报名中', cls: 'bg-primary/10 text-primary'}
}

function Home() {
  const {user, profile} = useAuth()
  const loginUsername = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const isAdminAccount = String(loginUsername).trim().toLowerCase() === 'admin'
  const isAdmin = profile?.role === 'admin'

  const [activeSeason, setActiveSeason] = useCachedState<Season | null>('home-season', null)
  const [activities, setActivities] = useCachedState<ActivityWithCount[]>('home-activities', [])
  const [myJoined, setMyJoined] = useCachedState<string[]>('home-joined', [])
  const [kicks, setKicks] = useState<KickRequest[]>([])
  const [openPolls, setOpenPolls] = useState(false)
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('home')
  const loadedUserId = useRef<string | null | undefined>(undefined)
  const userIdRef = useRef(user?.id)
  userIdRef.current = user?.id

  const loadData = useCallback(async () => {
    startRefresh()
    try {
      const [home, kickList, pollsOpen] = await Promise.all([
        getActiveSeasonActivities(userIdRef.current).catch(async () => {
          const activities = await getActivities()
          const userId = userIdRef.current
          const joinedIds = userId ? await getMyRegisteredActivityIds(activities.map((activity) => activity.id), userId) : []
          return {season: null, activities, joinedIds}
        }),
        SHOW_DUNKU_ENTRY ? getKickRequests('open').catch(() => []) : Promise.resolve([]),
        // 有进行中的投票才显示入口；查询失败按无处理
        SHOW_VOTE_CENTER_ENTRY && userIdRef.current ? hasOpenPolls().catch(() => false) : Promise.resolve(false)
      ])
      setActiveSeason(home.season as Season | null)
      setActivities(home.activities)
      setKicks(kickList)
      setMyJoined(home.joinedIds)
      setOpenPolls(pollsOpen)

    } catch (err) {
      console.error('Failed to load home data:', err)
    } finally {
      finishRefresh()
    }
  }, [])

  useDidShow(() => {
    loadedUserId.current = userIdRef.current ?? null
    loadData()
  })

  useEffect(() => {
    const userId = user?.id ?? null
    if (loadedUserId.current === undefined || loadedUserId.current === userId) return
    loadedUserId.current = userId
    loadData()
  }, [user?.id, loadData])

  return (
    <div className="min-h-screen bg-background relative">
      <LogoBg />
      <div className="relative z-10">
      {/* 顶部：赛季横幅 */}
      <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
        <h1 className="font-heading text-3xl text-primary-foreground">球队活动</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="i-mdi-trophy-outline text-2xl text-primary-foreground/80" />
          <p className="text-xl text-primary-foreground/80">
            {activeSeason ? `当前赛季 · ${activeSeason.name}` : '暂无进行中的赛季'}
          </p>
        </div>

        <div className="flex gap-3 mt-5">
          {isAdmin && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
              onClick={() => Taro.navigateTo({url: '/pages/activity-create/index'})}
            >
              <div className="py-2.5 px-4 flex items-center gap-1">
                <div className="i-mdi-plus text-xl" />
                <span className="text-xl font-medium">发布活动</span>
              </div>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary-foreground/40 lift-glow"
              onClick={() => Taro.navigateTo({url: '/pages/season-manage/index'})}
            >
              <div className="py-2.5 px-4 flex items-center gap-1">
                <div className="i-mdi-trophy text-xl" />
                <span className="text-xl text-primary-foreground">赛季管理</span>
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="px-5 -mt-6 pb-8 flex flex-col gap-4">
        {SHOW_DUNKU_ENTRY && !loading && (
          <div
            className="bg-card rounded-2xl gold-frame p-4 flex flex-col gap-3"
            onClick={() => Taro.navigateTo({url: '/pages/dunku/index'})}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="i-mdi-account-group-outline text-2xl text-primary" />
                <span className="font-heading text-2xl text-foreground">蹲坑专区</span>
              </div>
              <div className="flex items-center gap-1">
                {kicks.length > 0 && <span className="text-lg text-muted-foreground">{kicks.length} 个进行中</span>}
                <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
              </div>
            </div>
            <p className="text-base text-muted-foreground">想踢球没场次？发起蹲坑，凑够人数队长就加场</p>
            {kicks.slice(0, 2).map((k) => {
              const reached = k.participant_count >= k.target
              return (
                <div key={k.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${reached ? 'bg-primary/10' : 'bg-muted'}`}>
                  <div className="i-mdi-map-marker-outline text-xl text-primary" />
                  <span className="text-lg text-foreground flex-1 overflow-hidden">{k.preferred_location}</span>
                  <span className={`text-lg ${reached ? 'text-primary' : 'text-muted-foreground'}`}>{k.participant_count}/{k.target}</span>
                  {reached && <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-base">可加场</span>}
                </div>
              )
            })}
          </div>
        )}

        {SHOW_VOTE_CENTER_ENTRY && !loading && !!user && !isAdminAccount && openPolls && (
          <div
            className="bg-card rounded-2xl border-2 border-primary/30 lift-glow p-4 flex items-center gap-4"
            onClick={() => Taro.navigateTo({url: '/pages/vote-center/index'})}
          >
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <div className="i-mdi-vote-outline text-3xl text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-2xl text-foreground">投票中心</h3>
              <p className="text-lg text-muted-foreground mt-0.5">队内事务表决</p>
            </div>
            <div className="i-mdi-chevron-right text-3xl text-muted-foreground" />
          </div>
        )}

        {!!user && !isAdminAccount && (
          <div
            className="bg-card rounded-2xl border-2 border-primary/30 lift-glow p-4 flex items-center gap-4"
            onClick={() => Taro.navigateTo({url: '/pages/gallery/index'})}
          >
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <div className="i-mdi-image-multiple-outline text-3xl text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-2xl text-foreground">群相册</h3>
              <p className="text-lg text-muted-foreground mt-0.5">球队精彩瞬间</p>
            </div>
            <div className="i-mdi-chevron-right text-3xl text-muted-foreground" />
          </div>
        )}

        {loading && activities.length === 0 && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}

        {!loading && activities.length === 0 && (
          <div className="bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-soccer text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">
              {activeSeason ? '本赛季还没有活动，点上方按钮发起' : '还没有活动，先请管理员创建赛季'}
            </p>
          </div>
        )}

        {activities.length > 0 &&
          activities.map((a) => {
            const count = playerCount(a)
            const status = activityStatus(a)
            const joined = myJoined.includes(a.id)
            return (
              <div
                key={a.id}
                className="bg-card rounded-2xl gold-frame p-4 lift-glow"
                onClick={() => Taro.navigateTo({url: `/pages/activity-detail/index?id=${a.id}`})}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-base font-medium">
                      {MATCH_FORMATS[a.match_format || '11']?.name || '11人制'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground text-base font-medium">
                      {a.match_type === 'external' ? '外战' : '内战'}
                    </span>
                    <h3 className="font-heading text-2xl text-foreground">{a.title}</h3>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-lg ${status.cls}`}>{status.label}</span>
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-calendar-month-outline text-2xl text-primary" />
                    <span className="text-xl text-muted-foreground">{formatActivityTime(a.activity_time)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-map-marker-outline text-2xl text-primary" />
                    <span className="text-xl text-muted-foreground flex-1 overflow-hidden">{a.location}</span>
                    {joined && (
                      <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground text-lg">
                        已报名
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-gold rounded-full"
                      style={{width: `${Math.min(100, (count / a.max_players) * 100)}%`}}
                    />
                  </div>
                  <span className="text-lg text-muted-foreground">
                    {count}/{a.max_players} 人
                  </span>
                </div>
              </div>
            )
          })}
      </div>
    </div>
    </div>
  )
}

export default withRouteGuard(Home)
