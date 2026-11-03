// @title 发布活动
import {useEffect, useMemo, useState} from 'react'
import Taro from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {convertKickRequest, createActivity, getSeasons} from '@/db/api'
import type {Season} from '@/db/types'
import {buildDefaultNotice, cancelRuleText, CANCEL_MODE_DEFAULTS, DEFAULT_CANCEL_RULE, MATCH_FORMATS, MATCH_TYPES, type CancelCutoffMode, type MatchFormat, type MatchType, toDateInput} from '@/constants'

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

function ActivityCreate() {
  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [seasons, setSeasons] = useState<Season[]>([])
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('5')
  const [matchType, setMatchType] = useState<MatchType>('internal')
  const [coachSlots, setCoachSlots] = useState('2')
  const [captainSlots, setCaptainSlots] = useState('2')
  const [teamGroups, setTeamGroups] = useState('2')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => toDateInput(new Date(Date.now() + 3 * 86400000)))
  const [time, setTime] = useState('19:00')
  const [endTimeStr, setEndTimeStr] = useState('21:00')
  const [location, setLocation] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(String(MATCH_FORMATS['5'].defaultMaxPlayers))
  const [note, setNote] = useState('')
  /** 取消报名截止规则：hours = 开赛前 N 小时；sameday = 每天 N 点后 */
  const [cancelMode, setCancelMode] = useState<CancelCutoffMode>(DEFAULT_CANCEL_RULE.mode)
  const [cancelValue, setCancelValue] = useState(String(DEFAULT_CANCEL_RULE.value))
  const [notice, setNotice] = useState(() => buildDefaultNotice())
  const [submitting, setSubmitting] = useState(false)

  // 从蹲坑带入：期望时间/场地
  const params = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])
  const dunkuId = params.dunku_id || ''
  const preferredTime = params.preferred_time ? decodeURIComponent(params.preferred_time) : ''
  const preferredLocation = params.preferred_location ? decodeURIComponent(params.preferred_location) : ''

  useEffect(() => {
    if (preferredLocation) setLocation(preferredLocation)
    if (preferredTime) {
      setNote((n) => `${n ? `${n}\n` : ''}蹲坑期望时间：${preferredTime}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换赛制联动默认人数与推荐
  const handleFormatChange = (fmt: MatchFormat) => {
    setMatchFormat(fmt)
    const cfg = MATCH_FORMATS[fmt]
    setMaxPlayers(String(cfg.defaultMaxPlayers))
  }

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
    // 切换模式时重置为该模式默认值（hours 6 / sameday 12）
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

  useEffect(() => {
    getSeasons().then((list) => {
      setSeasons(list)
      if (!list.some((s) => s.is_active)) {
        Taro.showToast({title: '请先在赛季管理中激活一个赛季', icon: 'none'})
      }
    })
  }, [])

  const activeSeason = seasons.find((s) => s.is_active)



  const handleSubmit = async () => {
    if (submitting) return
    if (!isAdmin) {
      Taro.showToast({title: '仅队长和管理员可发布活动', icon: 'none'})
      return
    }
    if (!activeSeason) {
      Taro.showToast({title: '请先创建并激活一个赛季', icon: 'none'})
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
    // ISO 字符串：本地时间解析（微信真机与H5一致）
    const activityTime = new Date(`${date}T${time}:00`)
    if (Number.isNaN(activityTime.getTime())) {
      Taro.showToast({title: '时间格式不正确', icon: 'none'})
      return
    }
    if (activityTime.getTime() <= Date.now()) {
      Taro.showToast({title: '活动时间需晚于当前时间', icon: 'none'})
      return
    }
    // 活动只在一天：结束时间与开始同一天
    const dur = new Date(`${date}T${endTimeStr}:00`)
    if (Number.isNaN(dur.getTime())) {
      Taro.showToast({title: '结束时间格式不正确', icon: 'none'})
      return
    }
    if (dur.getTime() <= activityTime.getTime()) {
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
      const ok = await createActivity({
        season_id: activeSeason.id,
        title: title.trim(),
        activity_time: activityTime.toISOString(),
        end_time: dur.toISOString(),
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
        if (dunkuId) await convertKickRequest(dunkuId)
        Taro.showToast({title: '发布成功', icon: 'success'})
        setTimeout(() => Taro.navigateBack(), 600)
      } else {
        Taro.showToast({title: '发布失败，请重试', icon: 'none'})
      }
    } finally {
      setSubmitting(false)
    }
  }

  const fieldCls = 'border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden'

  return (
    <div className="min-h-screen bg-background px-5 py-6 flex flex-col gap-4">
      <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
        <h2 className="font-heading text-2xl text-foreground">发起报名接龙</h2>
        <div className="vine-divider" />

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">赛制类型</span>
          <div className="flex flex-row gap-2">
            {(['5', '8', '11'] as MatchFormat[]).map((fmt) => {
              const active = matchFormat === fmt
              return (
                <button
                  key={fmt}
                  type="button"
                  className={`flex-1 flex items-center justify-center py-2.5 rounded-xl border-2 transition ${
                    active ? 'border-primary bg-primary/10' : 'border-border bg-background'
                  }`}
                  onClick={() => handleFormatChange(fmt)}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`i-mdi-soccer text-xl ${active ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span className={`text-xl font-medium ${active ? 'text-primary' : 'text-foreground'}`}>
                      {MATCH_FORMATS[fmt].name}
                    </span>
                  </div>
                </button>
              )
            })}
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
          <span className="text-xl text-muted-foreground">活动标题</span>
          <div className={fieldCls}>
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="如：周末友谊赛"
              value={title}
              onInput={(e) => {
                const ev = e as any
                setTitle(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

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
              placeholder="如：滨江足球公园 3号场"
              value={location}
              onInput={(e) => {
                const ev = e as any
                setLocation(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">人数上限</span>
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
          <div className="flex flex-row gap-2 mt-1">
            {MATCH_FORMATS[matchFormat].recommendedPlayers.map((n) => (
              <button
                key={n}
                type="button"
                className={`flex-1 flex items-center justify-center rounded-lg py-1.5 ${
                  maxPlayers === String(n) ? 'bg-primary/15 border-2 border-primary/50' : 'bg-muted'
                }`}
                onClick={() => setMaxPlayers(String(n))}
              >
                <span
                  className={`text-lg ${maxPlayers === String(n) ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {n}人
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">备注（选填）</span>
          <div className={`${fieldCls} h-32`}>
            <textarea
              className="w-full h-full text-xl text-foreground bg-transparent outline-none"
              placeholder="如：白队穿浅色球衣，请提前15分钟到场"
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
            <span className="text-xl text-foreground">免责约定（默认已填，可编辑）</span>
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
            onClick={() => {
              const n = parseInt(cancelValue, 10)
              setNotice(buildDefaultNotice(cancelMode, Number.isInteger(n) ? n : DEFAULT_CANCEL_RULE.value))
            }}
          >
            <div className="i-mdi-refresh text-lg text-muted-foreground" />
            <span className="text-base text-muted-foreground">恢复默认</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${
          submitting ? 'bg-primary/50' : 'bg-primary lift-glow'
        }`}
        onClick={handleSubmit}
      >
        <div className="py-3.5 px-6 text-2xl text-primary-foreground font-medium">
          {submitting ? '发布中…' : '发布活动'}
        </div>
      </button>

      {!activeSeason && seasons.length > 0 && (
        <p className="text-lg text-destructive text-center">尚未激活赛季，发布前请先在「赛季管理」中激活</p>
      )}
    </div>
  )
}

export default withRouteGuard(ActivityCreate)
