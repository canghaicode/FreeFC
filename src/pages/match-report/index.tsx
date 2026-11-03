// @title 填报数据
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Taro, {useDidShow, usePageScroll} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getJoinedActivities, getMyAllMatchStats, getMyMatchStats, upsertMatchStats} from '@/db/api'
import type {Activity, MatchStats} from '@/db/types'
import {formatActivityTime} from '@/constants'

function MatchReport() {
  const routerActivityId = useMemo(() => Taro.getCurrentInstance().router?.params?.activity_id || '', [])
  const {user} = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [myStats, setMyStats] = useState<MatchStats | null>(null)
  const [reportedIds, setReportedIds] = useState<string[]>([])
  const [goals, setGoals] = useState('0')
  const [assists, setAssists] = useState('0')
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('match-report')
  const [saving, setSaving] = useState(false)
  const [panelHidden, setPanelHidden] = useState(false)
  const lastScrollTop = useRef(0)
  // 任何方向滑动都隐藏底部填报面板，点击屏幕任意位置才恢复（参照报名页底部按钮）
  usePageScroll(({scrollTop}: {scrollTop: number}) => {
    const delta = scrollTop - lastScrollTop.current
    lastScrollTop.current = scrollTop
    if (Math.abs(delta) > 2) setPanelHidden(true)
  })

  /** 可填报的活动：已报名且已结束 */
  const reportable = useMemo(() => {
    return activities.filter((a) => new Date(a.activity_time).getTime() <= Date.now())
  }, [activities])

  const selected = reportable.find((a) => a.id === selectedId)

  const loadedUserId = useRef<string | null | undefined>(undefined)
  const userRef = useRef(user)
  userRef.current = user
  const loadBase = useCallback(async () => {
    const currentUser = userRef.current
    if (!currentUser) return
    startRefresh()
    const [mine, stats] = await Promise.all([getJoinedActivities(currentUser.id), getMyAllMatchStats()])
    setActivities(mine)
    setReportedIds(stats.map((s) => s.activity_id))
    if (routerActivityId && mine.some((a) => a.id === routerActivityId)) {
      setSelectedId(routerActivityId)
    } else {
      setSelectedId((prev) => (prev && mine.some((a) => a.id === prev) ? prev : mine[0]?.id || ''))
    }
    finishRefresh()
  }, [routerActivityId])

  useDidShow(() => {
    loadedUserId.current = userRef.current?.id ?? null
    loadBase()
  })

  useEffect(() => {
    const userId = user?.id ?? null
    if (loadedUserId.current === undefined || loadedUserId.current === userId) return
    loadedUserId.current = userId
    loadBase()
  }, [user?.id, loadBase])

  /** 切换活动时载入已填报数据 */
  useEffect(() => {
    if (!selectedId) {
      setMyStats(null)
      setGoals('0')
      setAssists('0')
      return
    }
    getMyMatchStats(selectedId).then((s) => {
      setMyStats(s)
      setGoals(String(s?.goals ?? 0))
      setAssists(String(s?.assists ?? 0))
    })
  }, [selectedId])

  const handleSave = async () => {
    if (saving || !selectedId) return
    const g = parseInt(goals, 10)
    const a = parseInt(assists, 10)
    if (!Number.isInteger(g) || g < 0 || g > 20) {
      Taro.showToast({title: '进球数需为0-20的整数', icon: 'none'})
      return
    }
    if (!Number.isInteger(a) || a < 0 || a > 20) {
      Taro.showToast({title: '助攻数需为0-20的整数', icon: 'none'})
      return
    }
    setSaving(true)
    try {
      const res = await upsertMatchStats(selectedId, g, a)
      if (res.ok) {
        Taro.showToast({title: '填报成功', icon: 'success'})
        const stats = await getMyAllMatchStats()
        setReportedIds(stats.map((s) => s.activity_id))
      } else {
        Taro.showToast({title: res.message || '填报失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">加载中…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-5 py-6 flex flex-col gap-4">
      {/* 场次选择 */}
      <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl text-foreground">选择比赛场次</h2>
        </div>
        <div className="vine-divider" />

        {reportable.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="i-mdi-clipboard-text-off-outline text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">暂无可填报的比赛</p>
            <p className="text-lg text-muted-foreground">报名并完赛后即可填写进球与助攻</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reportable.map((a) => {
              const reported = reportedIds.includes(a.id)
              const active = a.id === selectedId
              return (
                <div
                  key={a.id}
                  className={`rounded-xl p-4 border-2 ${
                    active ? 'border-primary bg-primary/10' : 'border-border bg-background'
                  }`}
                  onClick={() => {
                    setSelectedId(a.id)
                    setPanelHidden(false)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl text-foreground flex-1 truncate">{a.title}</span>
                    {reported && (
                      <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground text-lg">
                        已填报
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="i-mdi-calendar-month-outline text-xl text-muted-foreground" />
                    <span className="text-lg text-muted-foreground">{formatActivityTime(a.activity_time)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 数据填报（底部浮动面板：标题、说明、进球/助攻、提交按钮整块常驻屏幕底部） */}
      {selected && (
        <div className={`fixed bottom-0 left-0 right-0 z-30 bg-card rounded-t-2xl gold-frame p-5 pb-8 flex flex-col gap-4 max-h-[70vh] overflow-y-auto transition-transform duration-300 ${panelHidden ? 'translate-y-full' : 'translate-y-0'}`}>
          <h2 className="font-heading text-2xl text-foreground">{selected.title}</h2>
          <p className="text-lg text-muted-foreground">
            {myStats ? '已填报过本场数据，可修改后再次保存' : '首次填报本场数据'}
          </p>
          <div className="vine-divider" />

          {/* 进球 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="i-mdi-soccer text-3xl text-primary" />
              <span className="text-xl text-foreground">进球</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center lift-glow"
                onClick={() => setGoals((v) => String(Math.max(0, parseInt(v || '0', 10) - 1)))}
              >
                <div className="i-mdi-minus text-2xl text-primary" />
              </button>
              <span className="font-heading text-4xl text-foreground w-12 text-center">{goals}</span>
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center lift-glow"
                onClick={() => setGoals((v) => String(Math.min(20, parseInt(v || '0', 10) + 1)))}
              >
                <div className="i-mdi-plus text-2xl text-primary" />
              </button>
            </div>
          </div>

          {/* 助攻 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="i-mdi-hand-clap-outline text-3xl text-primary" />
              <span className="text-xl text-foreground">助攻</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center lift-glow"
                onClick={() => setAssists((v) => String(Math.max(0, parseInt(v || '0', 10) - 1)))}
              >
                <div className="i-mdi-minus text-2xl text-primary" />
              </button>
              <span className="font-heading text-4xl text-foreground w-12 text-center">{assists}</span>
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center lift-glow"
                onClick={() => setAssists((v) => String(Math.min(20, parseInt(v || '0', 10) + 1)))}
              >
                <div className="i-mdi-plus text-2xl text-primary" />
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${
              saving ? 'bg-primary/50' : 'bg-primary lift-glow'
            }`}
            onClick={handleSave}
          >
            <div className="py-3.5 px-6 text-2xl text-primary-foreground font-medium">
              {saving ? '保存中…' : '提交数据'}
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(MatchReport)
