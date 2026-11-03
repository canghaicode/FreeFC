// @title 战术板与首发阵容

import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useMemo, useRef, useState} from 'react'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {Avatar, CachedAvatarImage} from '@/components/Avatar'
import {withRouteGuard} from '@/components/RouteGuard'
import {defaultSlotCoords, MATCH_FORMATS, type MatchFormat } from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {getActivity, getLineup, getRegistrationsWithProfiles, saveLineup} from '@/db/api'
import type {Activity, LineupPosition, Profile, Registration} from '@/db/types'

/** 战术板点位对象 */
interface TacticalSlot {
  id: string
  number: string
  label: string
  x: number // 百分比 0-100
  y: number // 百分比 0-100
  user_id: string | null
}

function LineupPage() {
  const activityId = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])
  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [activity, setActivity] = useState<Activity | null>(null)
  /** 可编辑：管理员或活动发起人 */
  const canEdit = isAdmin || (!!activity && activity.created_by === profile?.id)

  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [format, setFormat] = useState<MatchFormat>('11')
  const [formation, setFormation] = useState('4-3-3')
  const [slots, setSlots] = useState<TacticalSlot[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('lineup')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // 选中的点位（用于点位操作/队员分配抽屉）
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  // 添加点位对话框状态
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSlotNumber, setNewSlotNumber] = useState('')
  // 修改号码对话框状态
  const [editNumberSlotId, setEditNumberSlotId] = useState<string | null>(null)
  const [editNumberValue, setEditNumberValue] = useState('')

  // 拖拽状态
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null)
  const pitchRef = useRef<{top: number; left: number; width: number; height: number} | null>(null)
  const dragStartPosRef = useRef<{x: number; y: number} | null>(null)
  const hasMovedRef = useRef(false)

  // 赛制配置
  const formatConfig = useMemo(() => MATCH_FORMATS[format] || MATCH_FORMATS['11'], [format])
  const availableFormations = useMemo(() => Object.keys(formatConfig.formations), [formatConfig])

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>()
    for (const r of registrations) {
      if (r.profiles) map.set(r.user_id, {...(r.profiles as any), id: r.user_id} as Profile)
    }
    return map
  }, [registrations])

  /** 生成指定阵型的默认点位列表 */
  const createDefaultSlots = useCallback(
    (fmt: MatchFormat, formName: string, existingSlots: TacticalSlot[] = []): TacticalSlot[] => {
      const cfg = MATCH_FORMATS[fmt] || MATCH_FORMATS['11']
      const rows = cfg.formations[formName] || cfg.formations[cfg.defaultFormation] || [4, 3, 3]
      const totalCount = rows.reduce((s, n) => s + n, 0) + 1
      const result: TacticalSlot[] = []

      // 提取已有已安排的队员 ID 顺序
      const assignedUserIds = existingSlots.map((s) => s.user_id).filter((uid): uid is string => !!uid)
      let userIdx = 0

      for (let s = 0; s < totalCount; s++) {
        const info = defaultSlotCoords(rows, s)
        result.push({
          id: `slot_${s}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          number: info.defaultNum,
          label: info.role,
          x: info.x,
          y: info.y,
          user_id: userIdx < assignedUserIds.length ? assignedUserIds[userIdx++] : null
        })
      }
      return result
    },
    []
  )

  const loadData = useCallback(async () => {
    if (!activityId) return
    startRefresh()
    const [regs, lineup, act] = await Promise.all([
      getRegistrationsWithProfiles(activityId),
      getLineup(activityId),
      getActivity(activityId)
    ])
    setRegistrations(regs)
    setActivity(act)

    const actFormat = (act?.match_format as MatchFormat) || '11'
    setFormat(actFormat)
    const cfg = MATCH_FORMATS[actFormat] || MATCH_FORMATS['11']

    if (lineup && lineup.positions && lineup.positions.length > 0) {
      setFormation(lineup.formation)
      const validIds = new Set(regs.map((r) => r.user_id))
      const rows = cfg.formations[lineup.formation] || cfg.formations[cfg.defaultFormation] || [4, 3, 3]

      // 还原点位：如果旧数据缺失 x, y 坐标，自适应补全
      const loaded: TacticalSlot[] = lineup.positions.map((p, idx) => {
        const def = defaultSlotCoords(rows, p.slot ?? idx)
        return {
          id: p.id || `slot_${idx}_${Date.now()}`,
          number: p.number || (p.slot === 0 ? 'GK' : def.defaultNum),
          label: p.label || def.role,
          x: typeof p.x === 'number' ? Math.max(6, Math.min(94, p.x)) : def.x,
          y: typeof p.y === 'number' ? Math.max(6, Math.min(94, p.y)) : def.y,
          user_id: p.user_id && validIds.has(p.user_id) ? p.user_id : null
        }
      })
      setSlots(loaded)
    } else {
      // 首次加载无阵型，生成默认阵型点位
      const defForm = cfg.defaultFormation
      setFormation(defForm)
      setSlots(createDefaultSlots(actFormat, defForm))
    }
    finishRefresh()
  }, [activityId, createDefaultSlots])


  useDidShow(() => {
    loadData()
  })

  /** 切换阵型预设 */
  const switchFormation = (f: string) => {
    if (f === formation) return
    setFormation(f)
    setSlots((prev) => createDefaultSlots(format, f, prev))
    setSelectedSlotId(null)
    setDirty(true)
    Taro.showToast({title: `已切换为 ${f} 阵型`, icon: 'none'})
  }

  /** 重置当前阵型为标准几何站位 */
  const handleResetPositions = () => {
    if (!canEdit) return
    Taro.showModal({
      title: '重置站位',
      content: '是否将场上所有点位恢复为该阵型的标准位置？已安排队员保留。',
      confirmColor: '#2D5016',
      success: (res) => {
        if (res.confirm) {
          setSlots((prev) => createDefaultSlots(format, formation, prev))
          setDirty(true)
          Taro.showToast({title: '站位已重置', icon: 'success'})
        }
      }
    })
  }

  /** 测量球场容器位置（换算百分比坐标） */
  const measurePitch = () =>
    new Promise<{top: number; left: number; width: number; height: number} | null>((resolve) => {
      const query = Taro.createSelectorQuery()
      query
        .select('#tactical-pitch')
        .boundingClientRect((rect: any) => {
          resolve(rect ? {top: rect.top, left: rect.left, width: rect.width, height: rect.height} : null)
        })
        .exec()
    })

  /** 开始拖动点位 */
  const handleSlotTouchStart = async (slotId: string, touch: any) => {
    if (!canEdit || !touch) return
    setDraggingSlotId(slotId)
    hasMovedRef.current = false
    dragStartPosRef.current = {x: touch.clientX, y: touch.clientY}
    pitchRef.current = await measurePitch()
  }

  /** 拖动中：实时更新点位坐标 */
  const handlePitchTouchMove = (e: any) => {
    if (!draggingSlotId || !pitchRef.current) return
    const touch = e.changedTouches?.[0] || e.touches?.[0]
    if (!touch) return

    if (dragStartPosRef.current) {
      const dx = Math.abs(touch.clientX - dragStartPosRef.current.x)
      const dy = Math.abs(touch.clientY - dragStartPosRef.current.y)
      if (dx > 4 || dy > 4) {
        hasMovedRef.current = true
      }
    }

    const rect = pitchRef.current
    const px = Math.max(6, Math.min(94, ((touch.clientX - rect.left) / rect.width) * 100))
    const py = Math.max(6, Math.min(94, ((touch.clientY - rect.top) / rect.height) * 100))

    setSlots((prev) =>
      prev.map((s) => (s.id === draggingSlotId ? {...s, x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10} : s))
    )
    setDirty(true)
  }

  /** 拖动结束 */
  const handlePitchTouchEnd = () => {
    if (!draggingSlotId) return
    const moved = hasMovedRef.current
    const clickedId = draggingSlotId
    setDraggingSlotId(null)
    dragStartPosRef.current = null
    pitchRef.current = null

    // 若位移极小，视为点击选择该点位
    if (!moved) {
      setSelectedSlotId((prev) => (prev === clickedId ? null : clickedId))
    }
  }

  /** 添加自定义点位 */
  const handleConfirmAddSlot = () => {
    const num = newSlotNumber.trim() || String(slots.length + 1)
    const newSlot: TacticalSlot = {
      id: `slot_custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      number: num,
      label: '自定义',
      x: 50,
      y: 50,
      user_id: null
    }
    setSlots((prev) => [...prev, newSlot])
    setSelectedSlotId(newSlot.id)
    setDirty(true)
    setShowAddModal(false)
    setNewSlotNumber('')
    Taro.showToast({title: `已添加点位 #${num}，可拖动摆放`, icon: 'none'})
  }

  /** 修改点位号码 */
  const handleConfirmEditNumber = () => {
    if (!editNumberSlotId) return
    const num = editNumberValue.trim()
    if (!num) {
      Taro.showToast({title: '号码不能为空', icon: 'none'})
      return
    }
    setSlots((prev) => prev.map((s) => (s.id === editNumberSlotId ? {...s, number: num} : s)))
    setDirty(true)
    setEditNumberSlotId(null)
    setEditNumberValue('')
    Taro.showToast({title: '号码已修改', icon: 'success'})
  }

  /** 删除点位 */
  const handleDeleteSlot = (slotId: string) => {
    if (!canEdit) return
    if (slots.length <= 1) {
      Taro.showToast({title: '至少保留一个点位', icon: 'none'})
      return
    }
    setSlots((prev) => prev.filter((s) => s.id !== slotId))
    if (selectedSlotId === slotId) setSelectedSlotId(null)
    setDirty(true)
    Taro.showToast({title: '已删除点位', icon: 'none'})
  }

  /** 为点位分配/更换队员 */
  const handleAssignMemberToSlot = (slotId: string, userId: string) => {
    if (!canEdit) return
    setSlots((prev) => {
      // 若该队员已在其他点位，将其移至当前点位；同一点位替换原队员
      return prev.map((s) => {
        if (s.id === slotId) {
          return {...s, user_id: userId}
        }
        if (s.user_id === userId) {
          return {...s, user_id: null}
        }
        return s
      })
    })
    setDirty(true)
    setSelectedSlotId(null)
    Taro.showToast({title: '已安排上场', icon: 'none'})
  }

  /** 移出点位队员 */
  const handleRemoveMemberFromSlot = (slotId: string) => {
    if (!canEdit) return
    setSlots((prev) => prev.map((s) => (s.id === slotId ? {...s, user_id: null} : s)))
    setDirty(true)
    Taro.showToast({title: '已移出首发', icon: 'none'})
  }

  /** 点击候选队员：若有选中点位直接分配；若无则自动分配到第一个空点位 */
  const handleBenchMemberClick = (member: Profile) => {
    if (!canEdit) return
    if (selectedSlotId) {
      handleAssignMemberToSlot(selectedSlotId, member.id)
      return
    }
    const emptySlot = slots.find((s) => !s.user_id)
    if (emptySlot) {
      handleAssignMemberToSlot(emptySlot.id, member.id)
    } else {
      Taro.showToast({title: '场上点位已满，可点击点位进行替换或添加新点位', icon: 'none'})
    }
  }

  /** 保存阵型战术板 */
  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const positions: LineupPosition[] = slots.map((s, idx) => ({
        id: s.id,
        slot: idx,
        number: s.number,
        label: s.label,
        x: s.x,
        y: s.y,
        user_id: s.user_id
      }))
      const ok = await saveLineup(activityId, formation, positions)
      if (ok) {
        Taro.showToast({title: '战术板已保存', icon: 'success'})
        setDirty(false)
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }

  // 候选队员（已报名且未在场上）
  const bench = useMemo(() => {
    const onPitchUserIds = new Set(slots.map((s) => s.user_id).filter(Boolean))
    return registrations
      .filter((r) => !onPitchUserIds.has(r.user_id))
      .map((r) => ({reg: r, member: profileById.get(r.user_id)}))
      .filter((x): x is {reg: Registration; member: Profile} => !!x.member)
  }, [registrations, slots, profileById])

  const selectedSlot = useMemo(() => slots.find((s) => s.id === selectedSlotId) || null, [slots, selectedSlotId])
  const selectedMember = selectedSlot?.user_id ? profileById.get(selectedSlot.user_id) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">加载中…</p>
      </div>
    )
  }

  return (
    <div
      className="h-screen bg-background flex flex-col overflow-hidden"
      onTouchMove={handlePitchTouchMove}
      onTouchEnd={handlePitchTouchEnd}
      onTouchCancel={handlePitchTouchEnd}
    >
      {/* 顶部信息与赛制阵型切换 */}
      <div className="px-5 pt-3 pb-2 flex flex-col gap-2 bg-background border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-base font-medium">
              {formatConfig.name}
            </span>
            <h2 className="font-heading text-2xl text-foreground">战术板</h2>
            <span className="text-base text-muted-foreground">
              已安排 {slots.filter((s) => s.user_id).length}/{slots.length} 人
            </span>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-primary/40 bg-secondary/30 active:scale-95"
                onClick={() => {
                  setNewSlotNumber(String(slots.length + 1))
                  setShowAddModal(true)
                }}
              >
                <div className="i-mdi-plus-circle text-lg text-primary" />
                <span className="text-base text-primary font-medium">加点位</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-border bg-card active:scale-95"
                onClick={handleResetPositions}
              >
                <div className="i-mdi-restore text-lg text-muted-foreground" />
                <span className="text-base text-muted-foreground">重置</span>
              </button>
            </div>
          )}
        </div>

        {/* 预设阵型选择标签 */}
        {canEdit && (
          <div className="flex flex-row items-center gap-2 overflow-x-auto py-1">
            <span className="text-base text-muted-foreground shrink-0">阵型：</span>
            {availableFormations.map((f) => {
              const active = formation === f
              return (
                <button
                  key={f}
                  type="button"
                  className={`px-3 py-1 rounded-lg border-2 transition shrink-0 ${
                    active ? 'border-primary bg-primary/15' : 'border-border bg-card'
                  }`}
                  onClick={() => switchFormation(f)}
                >
                  <span className={`text-base font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {f}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 战术板球场（纵向标准草坪） */}
      <div className="flex-1 px-4 py-2 min-h-0 flex flex-col items-center justify-center">
        <div
          id="tactical-pitch"
          className="relative w-full h-full rounded-2xl overflow-hidden pitch-bg shadow-lg"
          style={{touchAction: 'none'}}
        >
          {/* 球场标线：中线与中圈 */}
          <div
            className="absolute left-0 right-0 border-b border-white/35"
            style={{top: '50%', transform: 'translateY(-50%)'}}
          />
          <div
            className="absolute rounded-full border border-white/35"
            style={{
              left: '50%',
              top: '50%',
              width: '80px',
              height: '80px',
              transform: 'translate(-50%, -50%)'
            }}
          />
          <div
            className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
            style={{left: '50%', top: '50%', transform: 'translate(-50%, -50%)'}}
          />

          {/* 顶部球门区与禁区（进攻半场） */}
          <div
            className="absolute border-b border-x border-white/35"
            style={{left: '20%', right: '20%', top: 0, height: '16%'}}
          />
          <div
            className="absolute border-b border-x border-white/35"
            style={{left: '35%', right: '35%', top: 0, height: '7%'}}
          />
          <div
            className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
            style={{left: '50%', top: '11%', transform: 'translate(-50%, -50%)'}}
          />

          {/* 底部球门区与禁区（防守/己方门将半场） */}
          <div
            className="absolute border-t border-x border-white/35"
            style={{left: '20%', right: '20%', bottom: 0, height: '16%'}}
          />
          <div
            className="absolute border-t border-x border-white/35"
            style={{left: '35%', right: '35%', bottom: 0, height: '7%'}}
          />
          <div
            className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
            style={{left: '50%', bottom: '11%', transform: 'translate(-50%, 50%)'}}
          />

          {/* 场地点位棋子 */}
          {slots.map((s) => {
            const member = s.user_id ? profileById.get(s.user_id) : null
            const isDragging = draggingSlotId === s.id
            const isSelected = selectedSlotId === s.id
            const isGK = s.number === 'GK' || s.label === '门将'

            return (
              <div
                key={s.id}
                className="absolute flex flex-col items-center gap-0.5 select-none"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isDragging ? 40 : isSelected ? 30 : 20,
                  cursor: canEdit ? 'grab' : 'default'
                }}
                onTouchStart={(e) => handleSlotTouchStart(s.id, e.touches?.[0])}
              >
                {/* 棋子圆圈 */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all relative ${
                    isDragging
                      ? 'scale-125 border-[#C9A227] shadow-gold bg-primary ring-4 ring-[#C9A227]/40'
                      : isSelected
                        ? 'scale-110 border-[#C9A227] shadow-gold bg-primary ring-2 ring-[#C9A227]'
                        : member
                          ? 'border-[#C9A227] bg-primary/95 shadow-md'
                          : isGK
                            ? 'border-amber-400 bg-amber-900/60'
                            : 'border-white/70 bg-black/40'
                  }`}
                >
                  {member ? (
                    member.avatar_url ? (
                      <CachedAvatarImage src={member.avatar_url} mode="aspectFill" className="w-full h-full rounded-full" lazyLoad />
                    ) : (
                      <span className="font-heading text-xl text-primary-foreground">
                        {(member.nickname || '队').slice(0, 1)}
                      </span>
                    )
                  ) : (
                    <span className="text-xl text-white font-heading font-bold">{s.number}</span>
                  )}

                  {/* 右上角号码小角标（当有点位队员时，标记点位编号） */}
                  {member && (
                    <div className="absolute -top-1.5 -right-1.5 bg-[#C9A227] text-[#2D5016] text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                      {s.number}
                    </div>
                  )}
                </div>

                {/* 队员姓名或点位号码标签 */}
                <span
                  className={`px-1.5 py-0.5 rounded text-xs truncate max-w-[72px] ${
                    isSelected
                      ? 'bg-[#C9A227] text-[#2D5016] font-bold'
                      : 'bg-black/60 text-white'
                  }`}
                >
                  {member ? member.nickname || '队员' : s.label || `位置 ${s.number}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部控制区：候选队员抽屉或选中点位操作面板 */}
      <div className="bg-card border-t-2 border-border px-4 pt-2.5 pb-4 max-h-56 flex flex-col gap-2">
        {/* 如果有选中的点位，展示该点位的详情与操作面板 */}
        {selectedSlot ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span className="font-heading text-xl text-foreground">
                  点位 #{selectedSlot.number}
                </span>
                <span className="text-base text-muted-foreground">({selectedSlot.label || '场上位置'})</span>
                {canEdit && (
                  <button
                    type="button"
                    className="text-base text-primary underline ml-1"
                    onClick={() => {
                      setEditNumberSlotId(selectedSlot.id)
                      setEditNumberValue(selectedSlot.number)
                    }}
                  >
                    改号
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedMember && canEdit && (
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded bg-muted text-destructive text-sm"
                    onClick={() => handleRemoveMemberFromSlot(selectedSlot.id)}
                  >
                    移出首发
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-sm"
                    onClick={() => handleDeleteSlot(selectedSlot.id)}
                  >
                    删除点位
                  </button>
                )}
                <button
                  type="button"
                  className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-sm"
                  onClick={() => setSelectedSlotId(null)}
                >
                  关闭
                </button>
              </div>
            </div>

            {/* 点位队员信息或分配候选 */}
            <div className="flex items-center justify-between">
              <span className="text-base text-muted-foreground">
                {selectedMember ? '当前首发：' : '点击下方候选队员分配到此位置：'}
              </span>
              {selectedMember && (
                <div className="flex items-center gap-2">
                  <Avatar url={selectedMember.avatar_url} name={selectedMember.nickname} size="sm" />
                  <span className="text-lg text-foreground font-medium">
                    {selectedMember.nickname || '队员'}
                    {selectedMember.jersey_number != null ? ` #${selectedMember.jersey_number}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* 可分配的候选队员快速列表 */}
            {canEdit && (
              <div className="flex flex-row gap-2 overflow-x-auto py-1">
                {bench.length === 0 && (
                  <span className="text-base text-muted-foreground">暂无可安排的候选队员</span>
                )}
                {bench.map(({member}) => (
                  <button
                    key={member.id}
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-primary/40 bg-secondary/30 shrink-0 active:scale-95"
                    onClick={() => handleAssignMemberToSlot(selectedSlot.id, member.id)}
                  >
                    <Avatar url={member.avatar_url} name={member.nickname} size="sm" />
                    <span className="text-base text-foreground">{member.nickname || '队员'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 未选中点位：常规候选名单展示 */
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-lg text-foreground font-medium">
                替补/候选队员（{bench.length}）
              </span>
              {canEdit && (
                <span className="text-sm text-muted-foreground">
                  可任意拖动场上棋子，点击点位可调换
                </span>
              )}
            </div>

            <div className="flex flex-row gap-2 overflow-x-auto py-1 min-h-[44px]">
              {bench.length === 0 && (
                <span className="text-base text-muted-foreground py-1">
                  {slots.filter((s) => s.user_id).length === 0
                    ? '暂无队员报名此活动'
                    : '已全部排入战术板'}
                </span>
              )}
              {bench.map(({member}) => (
                <div
                  key={member.id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border-2 shrink-0 ${
                    canEdit
                      ? 'border-[#C9A227]/40 bg-secondary/30 active:scale-95'
                      : 'border-border bg-muted'
                  }`}
                  onClick={() => handleBenchMemberClick(member)}
                >
                  <Avatar url={member.avatar_url} name={member.nickname} size="sm" />
                  <div className="flex flex-col">
                    <span className="text-base text-foreground leading-tight">
                      {member.nickname || '队员'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {member.preferred_position || '队员'}
                      {member.jersey_number != null ? ` #${member.jersey_number}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部保存按钮 */}
        {canEdit && (
          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl mt-1 ${
              saving || !dirty ? 'bg-primary/50' : 'bg-primary lift-glow'
            }`}
            onClick={handleSave}
          >
            <div className="py-2.5 text-xl text-primary-foreground font-medium">
              {saving ? '保存中…' : dirty ? '保存战术板' : '战术板已保存'}
            </div>
          </button>
        )}
      </div>

      {/* 弹窗：添加自定义点位 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-card w-full max-w-sm rounded-2xl gold-frame p-5 flex flex-col gap-4 scale-in">
            <h3 className="font-heading text-2xl text-foreground">添加战术点位</h3>
            <p className="text-base text-muted-foreground">
              为新点位指定一个球衣号码或标签（例如 10、7、9、GK 等）：
            </p>

            <div className="border-2 border-input rounded-xl px-4 py-2.5 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="点位号码/代号"
                value={newSlotNumber}
                onInput={(e) => {
                  const ev = e as any
                  setNewSlotNumber(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>

            {/* 快速推荐标签 */}
            <div className="flex flex-wrap gap-2">
              {['GK', '2', '3', '4', '6', '7', '8', '9', '10', '11'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="px-2 py-1 rounded bg-secondary/50 text-foreground text-sm"
                  onClick={() => setNewSlotNumber(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-border py-2 text-lg text-muted-foreground"
                onClick={() => setShowAddModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-primary py-2 text-lg text-primary-foreground font-medium"
                onClick={handleConfirmAddSlot}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：修改点位号码 */}
      {editNumberSlotId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
          <div className="bg-card w-full max-w-sm rounded-2xl gold-frame p-5 flex flex-col gap-4 scale-in">
            <h3 className="font-heading text-2xl text-foreground">修改点位号码</h3>
            <div className="border-2 border-input rounded-xl px-4 py-2.5 bg-background">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="如 10、7、GK"
                value={editNumberValue}
                onInput={(e) => {
                  const ev = e as any
                  setEditNumberValue(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-border py-2 text-lg text-muted-foreground"
                onClick={() => setEditNumberSlotId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-primary py-2 text-lg text-primary-foreground font-medium"
                onClick={handleConfirmEditNumber}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(LineupPage)
