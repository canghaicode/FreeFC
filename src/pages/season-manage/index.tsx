// @title 赛季管理
import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {Picker} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {activateSeason, createSeason, getSeasons} from '@/db/api'
import type {Season} from '@/db/types'
import {toDateInput} from '@/constants'

function SeasonManage() {
  const {profile} = useAuth()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('season-manage')

  const isAdmin = profile?.role === 'admin'

  const loadData = useCallback(async () => {
    startRefresh()
    setSeasons(await getSeasons())
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  const handleCreate = async () => {
    if (!name.trim()) {
      Taro.showToast({title: '请填写赛季名称', icon: 'none'})
      return
    }
    const ok = await createSeason(name.trim(), startDate || null, endDate || null)
    if (ok) {
      Taro.showToast({title: '赛季已创建', icon: 'success'})
      setName('')
      setStartDate('')
      setEndDate('')
      await loadData()
    } else {
      Taro.showToast({title: '创建失败，请重试', icon: 'none'})
    }
  }

  const handleActivate = async (season: Season) => {
    if (season.is_active) return
    const res = await Taro.showModal({
      title: '激活赛季',
      content: `将「${season.name}」设为当前赛季？新活动将关联该赛季。`
    })
    if (!res.confirm) return
    const ok = await activateSeason(season.id)
    if (ok) {
      Taro.showToast({title: '已激活', icon: 'success'})
      await loadData()
    } else {
      Taro.showToast({title: '激活失败，请重试', icon: 'none'})
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-8">
        <div className="bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
          <div className="i-mdi-lock-outline text-5xl text-muted-foreground/50" />
          <p className="text-xl text-muted-foreground">仅管理员可管理赛季</p>
        </div>
      </div>
    )
  }

  const fieldCls = 'border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden'

  return (
    <div className="min-h-screen bg-background px-5 py-6 flex flex-col gap-4">
      {/* 新建赛季 */}
      <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
        <h2 className="font-heading text-2xl text-foreground">创建赛季</h2>
        <div className="vine-divider" />

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">赛季名称</span>
          <div className={fieldCls}>
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="如：2026秋季赛季"
              value={name}
              onInput={(e) => {
                const ev = e as any
                setName(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-row gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">开始日期（选填）</span>
            <Picker mode="date" value={startDate || toDateInput(new Date())} onChange={(e) => setStartDate(e.detail.value)}>
              <div className={`${fieldCls} flex items-center justify-between`}>
                <span className={`text-xl ${startDate ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {startDate || '选择日期'}
                </span>
                <div className="i-mdi-calendar-month-outline text-2xl text-primary" />
              </div>
            </Picker>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">结束日期（选填）</span>
            <Picker mode="date" value={endDate || toDateInput(new Date())} onChange={(e) => setEndDate(e.detail.value)}>
              <div className={`${fieldCls} flex items-center justify-between`}>
                <span className={`text-xl ${endDate ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {endDate || '选择日期'}
                </span>
                <div className="i-mdi-calendar-month-outline text-2xl text-primary" />
              </div>
            </Picker>
          </div>
        </div>

        <button
          type="button"
          className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
          onClick={handleCreate}
        >
          <div className="py-3 px-6 text-xl text-primary-foreground font-medium">创建赛季</div>
        </button>
      </div>

      {/* 赛季列表 */}
      <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl text-foreground">历史赛季</h2>
          <span className="text-lg text-muted-foreground">共 {seasons.length} 个</span>
        </div>

        {loading && <p className="text-xl text-muted-foreground text-center py-4">加载中…</p>}

        {!loading && seasons.length === 0 && (
          <p className="text-xl text-muted-foreground text-center py-4">还没有赛季，先创建一个吧</p>
        )}

        {!loading &&
          seasons.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl p-4 flex items-center gap-3 ${
                s.is_active ? 'bg-primary/10 border-2 border-primary/40' : 'bg-background border-2 border-border'
              }`}
            >
              <div className="i-mdi-trophy text-3xl text-primary" />
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-xl text-foreground truncate">{s.name}</span>
                <span className="text-lg text-muted-foreground">
                  {s.start_date || s.end_date ? `${s.start_date || '?'} ~ ${s.end_date || '?'}` : '未设置日期'}
                </span>
              </div>
              {s.is_active ? (
                <span className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-lg">当前赛季</span>
              ) : (
                <button
                  type="button"
                  className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 lift-glow"
                  onClick={() => handleActivate(s)}
                >
                  <div className="py-1.5 px-4 text-lg text-primary">激活</div>
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

export default withRouteGuard(SeasonManage)
