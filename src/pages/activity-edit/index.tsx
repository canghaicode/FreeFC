// @title 编辑活动
import {useCallback, useEffect, useMemo, useState} from 'react'
import Taro from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getActivity, getRegistrationsWithProfiles, updateActivity} from '@/db/api'
import {buildDefaultNotice, cancelRuleText, CANCEL_MODE_DEFAULTS, DEFAULT_ACTIVITY_NOTICE, MATCH_FORMATS, MATCH_TYPES, type CancelCutoffMode, type MatchFormat, type MatchType, toDateInput, toTimeInput} from '@/constants'

/** 时间选择器：小时 0-23 + 分钟按整十步进 */
const TIME_HOURS = Array.from({length: 24}, (_, h) => String(h).padStart(2, '0'))
const TIME_MINUTES = ['00', '10', '20', '30', '40', '50']

const timeToIndex = (t: string): number[] => {
  const [h, m] = t.split(':')
  return [Number(h) || 0, Math.round((Number(m) || 0) / 10) % 6]
}

const indexToTime = (v: number[]): string =>
  `${TIME_HOURS[v[0] || 0]}:${TIME_MINUTES[v[1] || 0]}`

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 日期框显示：2026-10-30 格式化为 2026/10/30 周五 */
const formatDateLabel = (d: string): string => {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, day || 1)
  if (Number.isNaN(date.getTime())) return d
  return `${d.replace(/-/g, '/')} 周${WEEKDAYS[date.getDay()]}`
}

function ActivityEdit() {
  const id = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('11')
  const [matchType, setMatchType] = useState<MatchType>('internal')
  const [coachSlots, setCoachSlots] = useState('2')
  const [captainSlots, setCaptainSlots] = useState('2')
  const [teamGroups, setTeamGroups] = useState('2')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [endTimeStr, setEndTimeStr] = useState('')
  /** 取消报名截止规则 */
  const [cancelMode, setCancelMode] = useState<CancelCutoffMode>('hours')
  const [cancelValue, setCancelValue] = useState('6')
  const [location, setLocation] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('18')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState(DEFAULT_ACTIVITY_NOTICE)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joinedCount, setJoinedCount] = useState(0)

  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const fieldCls = 'border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden'

  /** 切换取消规则时同步约定第一条（保留用户手动追加/修改的其它行） */
  const applyRuleToNotice = (mode: CancelCutoffMode, value: number) => {
    setNotice((prev) => {
      const lines = prev.split('\n')
      const line1 = `1. ${cancelRuleText(mode, value)}；`
      if (lines.length > 0 && lines[0].startsWith('1.')) {
        lines[0] = line1
        return lines.join('\n')
      }
      return [line1, ...lines].join('\n')
    })
  }

  const handleCancelModeChange = (mode: CancelCutoffMode) => {
    const defaultValue = CANCEL_MODE_DEFAULTS[mode]
    setCancelMode(mode)
    setCancelValue(String(defaultValue))
    applyRuleToNotice(mode, defaultValue)
  }

  const handleCancelValueInput = (v: string) => {
    setCancelValue(v)
    const n = parseInt(v, 10)
    if (Number.isInteger(n)) applyRuleToNotice(cancelMode, n)
  }

  const loadActivity = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [act, regs] = await Promise.all([getActivity(id), getRegistrationsWithProfiles(id)])
    if (act) {
      setTitle(act.title)
      setMatchFormat((act.match_format || '11') as MatchFormat)
      setMatchType((act.match_type || 'internal') as MatchType)
      setCoachSlots(String(act.coach_slots ?? 0))
      setCaptainSlots(String(act.captain_slots ?? 0))
      setTeamGroups(String(Math.max(2, Math.min(4, act.team_groups ?? 2))))
      const start = new Date(act.activity_time)
      setDate(toDateInput(start))
      setTime(toTimeInput(start))
      // 结束时间：活动只在一天；无 end_time 的旧数据回退为开始时间 + 2 小时
      const end = act.end_time ? new Date(act.end_time) : new Date(start.getTime() + 2 * 3600000)
      setEndTimeStr(toTimeInput(end))
      setCancelMode((act.cancel_cutoff_mode || 'hours') as CancelCutoffMode)
      setCancelValue(String(act.cancel_cutoff_value ?? 6))
      setLocation(act.location)
      setMaxPlayers(String(act.max_players))
      setNote(act.note || '')
      setNotice(act.notice || DEFAULT_ACTIVITY_NOTICE)
    }
    // 队员上限只统计已确认的普通队员/队长；教练不占名额，随行嘉宾占名额。
    setJoinedCount(
      regs
        .filter((registration) => registration.seat_role !== 'coach' && registration.status === 'confirmed')
        .reduce((total, registration) => total + 1 + (registration.guest_count || 0), 0)
    )
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadActivity()
  }, [loadActivity])




  const handleSubmit = async () => {
    if (submitting) return
    if (!isAdmin) {
      Taro.showToast({title: '仅队长和管理员可编辑活动', icon: 'none'})
      return
    }
    if (!title.trim()) {
      Taro.showToast({title: '请填写活动标题', icon: 'none'})
      return
    }
    if (!location.trim()) {
      Taro.showToast({title: '请填写活动场地', icon: 'none'})
      return
    }
    const max = parseInt(maxPlayers, 10)
    if (!Number.isInteger(max) || max <= 0 || max > 50) {
      Taro.showToast({title: '人数限制为1-50的整数', icon: 'none'})
      return
    }
    if (max < joinedCount) {
      Taro.showToast({title: `已报名${joinedCount}人，上限不能更小`, icon: 'none'})
      return
    }
    const activityTime = new Date(`${date}T${time}:00`)
    if (Number.isNaN(activityTime.getTime())) {
      Taro.showToast({title: '时间格式不正确', icon: 'none'})
      return
    }
    // 活动只在一天：结束时间与开始同一天
    const end = new Date(`${date}T${endTimeStr}:00`)
    if (Number.isNaN(end.getTime())) {
      Taro.showToast({title: '结束时间格式不正确', icon: 'none'})
      return
    }
    if (end.getTime() <= activityTime.getTime()) {
      Taro.showToast({title: '结束时间需晚于开始时间', icon: 'none'})
      return
    }
    const cancelNum = parseInt(cancelValue, 10)
    const cancelOk =
      Number.isInteger(cancelNum) &&
      (cancelMode === 'hours' ? cancelNum >= 1 && cancelNum <= 72 : cancelNum >= 0 && cancelNum <= 23)
    if (!cancelOk) {
      Taro.showToast({
        title: cancelMode === 'hours' ? '提前小时须为 1-72 的整数' : '钟点须为 0-23 的整数',
        icon: 'none'
      })
      return
    }

    setSubmitting(true)
    try {
      const ok = await updateActivity(id, {
        title: title.trim(),
        activity_time: activityTime.toISOString(),
        end_time: end.toISOString(),
        location: location.trim(),
        max_players: max,
        match_format: matchFormat,
        match_type: matchType,
        cancel_cutoff_mode: cancelMode,
        cancel_cutoff_value: cancelNum,
        coach_slots: parseInt(coachSlots, 10) || 0,
        captain_slots: parseInt(captainSlots, 10) || 0,
        team_groups: matchType === 'internal' ? Math.max(2, Math.min(4, parseInt(teamGroups, 10) || 2)) : 1,
        note: note.trim() || null,
        notice: notice.trim() || null
      })
      if (ok) {
        Taro.showToast({title: '已保存', icon: 'success'})
        setTimeout(() => Taro.navigateBack(), 600)
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="i-mdi-loading text-5xl text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-5 pt-6 pb-40 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">活动标题</span>
          <div className={fieldCls}>
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              value={title}
              onInput={(e) => {
                const ev = e as any
                setTitle(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">赛制</span>
          <div className="flex flex-row gap-2">
            {(Object.keys(MATCH_FORMATS) as MatchFormat[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-lg border-2 ${
                  matchFormat === k ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'
                }`}
                onClick={() => setMatchFormat(k)}
              >
                <div className="py-2 text-lg text-foreground">{MATCH_FORMATS[k].name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">比赛类型</span>
          <div className="flex flex-row gap-2">
            {MATCH_TYPES.map((t) => {
              const active = matchType === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border-2 transition ${active ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
                  onClick={() => setMatchType(t.key)}
                >
                  <span className={`text-xl font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{t.label}</span>
                  <span className="text-base text-muted-foreground mt-0.5">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-row gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">主教练席位</span>
            <div className={fieldCls}>
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="number"
                value={coachSlots}
                onInput={(e) => {
                  const ev = e as any
                  setCoachSlots(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">队长席位</span>
            <div className={fieldCls}>
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="number"
                value={captainSlots}
                onInput={(e) => {
                  const ev = e as any
                  setCaptainSlots(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
          </div>
        </div>

        {matchType === 'internal' && (
          <div className="flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">内战分组数</span>
            <div className="flex flex-row gap-2">
              {[2, 3, 4].map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`flex-1 flex items-center justify-center rounded-lg py-2 ${
                    teamGroups === String(g) ? 'bg-primary/15 border-2 border-primary/50' : 'bg-muted'
                  }`}
                  onClick={() => setTeamGroups(String(g))}
                >
                  <span className={`text-xl ${teamGroups === String(g) ? 'text-primary' : 'text-muted-foreground'}`}>
                    {g} 组
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">活动日期</span>
          <Picker mode="date" value={date} onChange={(e) => setDate(e.detail.value)}>
            <div className={`${fieldCls} flex items-center justify-between`}>
              <span className="text-xl text-foreground">{formatDateLabel(date)}</span>
              <div className="i-mdi-calendar-month-outline text-2xl text-primary" />
            </div>
          </Picker>
        </div>

        <div className="flex flex-row gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">开始时间</span>
            <Picker mode="multiSelector" range={[TIME_HOURS, TIME_MINUTES]} value={timeToIndex(time)} onChange={(e) => setTime(indexToTime(e.detail.value as number[]))}>
              <div className={`${fieldCls} flex items-center justify-between`}>
                <span className="text-xl text-foreground">{time}</span>
                <div className="i-mdi-clock-outline text-2xl text-primary" />
              </div>
            </Picker>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">结束时间</span>
            <Picker mode="multiSelector" range={[TIME_HOURS, TIME_MINUTES]} value={timeToIndex(endTimeStr)} onChange={(e) => setEndTimeStr(indexToTime(e.detail.value as number[]))}>
              <div className={`${fieldCls} flex items-center justify-between`}>
                <span className="text-xl text-foreground">{endTimeStr}</span>
                <div className="i-mdi-clock-outline text-2xl text-primary" />
              </div>
            </Picker>
          </div>
        </div>

        {/* 取消报名截止规则 */}
        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">取消报名截止</span>
          <div className="flex flex-row gap-2">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center rounded-xl border-2 py-2.5 ${
                cancelMode === 'hours' ? 'border-primary bg-primary/10' : 'border-border/60 bg-background'
              }`}
              onClick={() => handleCancelModeChange('hours')}
            >
              <span className={`text-lg ${cancelMode === 'hours' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                开赛前 N 小时
              </span>
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center rounded-xl border-2 py-2.5 ${
                cancelMode === 'sameday' ? 'border-primary bg-primary/10' : 'border-border/60 bg-background'
              }`}
              onClick={() => handleCancelModeChange('sameday')}
            >
              <span className={`text-lg ${cancelMode === 'sameday' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                当天 N 点后
              </span>
            </button>
          </div>
          <div className="flex flex-row gap-2 items-center">
            <div className="w-24 border-2 border-input rounded-lg px-3 py-2.5 bg-background overflow-hidden">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="number"
                placeholder={cancelMode === 'hours' ? '6' : '12'}
                value={cancelValue}
                onInput={(e) => {
                  const ev = e as any
                  handleCancelValueInput(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
            <span className="text-lg text-muted-foreground">
              {cancelMode === 'hours' ? '小时（1-72）' : '点（0-23），此后至活动开始不可取消'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">场地</span>
          <div className={fieldCls}>
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              value={location}
              onInput={(e) => {
                const ev = e as any
                setLocation(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">人数上限（已报名 {joinedCount} 人）</span>
          <div className={fieldCls}>
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              type="number"
              value={maxPlayers}
              onInput={(e) => {
                const ev = e as any
                setMaxPlayers(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">备注（选填）</span>
          <div className={`${fieldCls} h-32`}>
            <textarea
              className="w-full h-full text-xl text-foreground bg-transparent outline-none"
              value={note}
              onInput={(e) => {
                const ev = e as any
                setNote(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="i-mdi-shield-check-outline text-2xl text-primary" />
            <span className="text-xl text-foreground">免责约定（可编辑）</span>
          </div>
          <div className={`${fieldCls} h-44`}>
            <textarea
              className="w-full h-full text-lg text-foreground bg-transparent outline-none leading-relaxed"
              value={notice}
              onInput={(e) => {
                const ev = e as any
                setNotice(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
          <button
            type="button"
            className="self-start flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5"
            onClick={() => setNotice(DEFAULT_ACTIVITY_NOTICE)}
          >
            <div className="i-mdi-refresh text-lg text-muted-foreground" />
            <span className="text-base text-muted-foreground">恢复默认</span>
          </button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border px-5 pt-4 pb-8">
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${
            submitting ? 'bg-primary/50' : 'bg-primary lift-glow'
          }`}
          onClick={handleSubmit}
        >
          <div className="py-3.5 px-6 text-2xl text-primary-foreground font-medium">
            {submitting ? '保存中…' : '保存修改'}
          </div>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(ActivityEdit)
