// @title 战术板
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {CSSProperties} from 'react'
import Taro, {useDidShow, useReady} from '@tarojs/taro'
import {Canvas, Image} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {LogoBg} from '@/components/LogoBg'
import {Avatar} from '@/components/Avatar'
import {TacticTemplateModal} from '@/components/TacticTemplateModal'
import {
  addTacticFeedback, confirmTactic, createTactic, deleteTactic, getActivity, getLineup, getRegistrationsWithProfiles, getTacticFeedback, getTacticFeedbackCounts, getTactics
} from '@/db/api'
import type {Activity, Profile, Registration, Tactic, TacticFeedback, TacticTemplate} from '@/db/types'
import {TacticView} from '@/components/TacticView'
import {drawTacticPoster} from '@/utils/tacticExport'
import {selectMediaFiles, uploadToSupabase} from '@/utils/upload'
import {supabase} from '@/client/supabase'
import {TACTIC_LINE_TYPES, VIEW_MODES} from '@/constants'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'

/** 战术要素：线条（pass/run/defend）或标记（flag 数字旗子 / opp 对方球员） */
interface DraftLine {
  kind: 'pass' | 'run' | 'defend' | 'flag' | 'opp'
  points: {x: number; y: number}[]
  order?: number
  /** 单条战术线的备注 */
  note?: string
  /** 线条形状：直线或弧线 */
  curve?: 'straight' | 'arc'
}

interface DraftPlayer {
  id: string
  /** 0-100 百分比坐标（与阵容页一致） */
  x: number
  y: number
  label: string
  avatar_url?: string | null
}

type Tool = 'line' | 'player' | 'flag' | 'opp'

/** 二次贝塞尔弧线采样（p0 起点、c 控制点、p2 终点），百分比坐标 */
function arcPoints(p0: {x: number; y: number}, c: {x: number; y: number}, p2: {x: number; y: number}, segs = 16): {x: number; y: number}[] {
  const pts: {x: number; y: number}[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y
    pts.push({x, y})
  }
  return pts
}

/** 将手绘的多个采样点自动优化为「直线」或「平滑弧线」 */
function fitStroke(raw: {x: number; y: number}[]): {points: {x: number; y: number}[]; curve: 'straight' | 'arc'} {
  if (raw.length < 2) return {points: raw, curve: 'straight'}
  const start = raw[0]
  const end = raw[raw.length - 1]
  const len = Math.hypot(end.x - start.x, end.y - start.y)
  if (len < 1) return {points: [start, end], curve: 'straight'}
  const ux = (end.x - start.x) / len
  const uy = (end.y - start.y) / len
  const nx = -uy
  const ny = ux
  // 各点相对起终连线的最大带符号垂直偏移
  let maxDev = 0
  for (let i = 1; i < raw.length - 1; i++) {
    const dev = (raw[i].x - start.x) * nx + (raw[i].y - start.y) * ny
    if (Math.abs(dev) > Math.abs(maxDev)) maxDev = dev
  }
  // 偏移很小 → 视为直线
  if (Math.abs(maxDev) / len < 0.08) {
    return {points: [start, end], curve: 'straight'}
  }
  // 否则拟合为弧线：控制点 = 弦中点 + 2 倍最大偏移（使弧线经过最大偏移点）
  const cx = (start.x + end.x) / 2 + 2 * maxDev * nx
  const cy = (start.y + end.y) / 2 + 2 * maxDev * ny
  return {points: [start, {x: cx, y: cy}, end], curve: 'arc'}
}

/** 纯 DOM 战术线渲染：按像素尺寸把每段线段转成旋转 div（weapp 不支持 SVG/Canvas 已弃用） */
function LineLayer({ln, size}: {ln: DraftLine; size: {w: number; h: number}}) {
  if (ln.points.length < 2 || !size.w || !size.h) return null
  const meta = TACTIC_LINE_TYPES.find((t) => t.key === ln.kind)
  const color = meta?.color || '#fff'
  const toPx = (pt: {x: number; y: number}) => ({px: (pt.x / 100) * size.w, py: (pt.y / 100) * size.h})
  const dash = ln.kind === 'pass' ? 'dashed' : ln.kind === 'defend' ? 'dotted' : 'solid'

  // 弧线：仅对带控制点的线启用，生成平滑采样点
  const pts = ln.curve === 'arc' && ln.points.length >= 3 ? arcPoints(ln.points[0], ln.points[1], ln.points[2]) : ln.points

  const segs = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = toPx(pts[i])
    const b = toPx(pts[i + 1])
    const len = Math.hypot(b.px - a.px, b.py - a.py)
    const ang = (Math.atan2(b.py - a.py, b.px - a.px) * 180) / Math.PI
    const segStyle: CSSProperties = {
      position: 'absolute',
      left: `${pts[i].x}%`,
      top: `${pts[i].y}%`,
      width: `${len}px`,
      height: 0,
      borderTop: `4px ${dash} ${color}`,
      transform: `rotate(${ang}deg)`,
      transformOrigin: '0 0',
      zIndex: 12
    }
    segs.push(<div key={i} style={segStyle} />)
  }

  // 终点箭头（像素坐标计算角度，避免球场长宽比导致偏差）
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  const lp = toPx(last)
  const pp = toPx(prev)
  const angEnd = (Math.atan2(lp.py - pp.py, lp.px - pp.px) * 180) / Math.PI
  const arrowStyle: CSSProperties = {
    position: 'absolute',
    left: `${last.x}%`,
    top: `${last.y}%`,
    width: 0,
    height: 0,
    borderLeft: `12px solid ${color}`,
    borderTop: '7px solid transparent',
    borderBottom: '7px solid transparent',
    transform: `rotate(${angEnd}deg)`,
    transformOrigin: '0 7px',
    zIndex: 12
  }

  // 起点序号徽章
  const sp = ln.points[0]
  const badgeStyle: CSSProperties = {
    position: 'absolute',
    left: `${sp.x}%`,
    top: `${sp.y}%`,
    transform: 'translate(-50%, -160%)',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    background: '#1a1a1a',
    border: `2px solid ${color}`,
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    zIndex: 13
  }

  return (
    <>
      {segs}
      <div style={arrowStyle} />
      {ln.order ? <div style={badgeStyle}>{ln.order}</div> : null}
    </>
  )
}

/** 我方（蓝色队员棋子）/ 对方球员（黑红）标记（纯 DOM） */
function MarkerLayer({ln, dragging}: {ln: DraftLine; dragging: boolean}) {
  const p = ln.points[0]
  if (!p) return null
  if (ln.kind === 'flag') {
    // 我方队员标记：蓝色棋子 + 人形图标 + 编号角标（与对方标记同构）
    return (
      <div
        style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: dragging ? 45 : 25
        }}
      >
        <div style={{position: 'relative'}}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              background: dragging ? '#1B5FCB' : 'rgba(37,99,235,0.95)',
              border: '2.5px solid #93C5FD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: dragging ? '0 0 0 5px rgba(46,134,222,0.45)' : '0 2px 6px rgba(0,0,0,0.35)'
            }}
          >
            <div className="i-mdi-account" style={{color: '#fff', fontSize: 22}} />
          </div>
          <div
            style={{
              position: 'absolute',
              right: -5,
              bottom: -3,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: '#0F3D91',
              border: '2px solid #93C5FD',
              color: '#fff',
              fontSize: 11,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {ln.order}
          </div>
        </div>
      </div>
    )
  }
  // 对方球员标记（黑红敌方样式）
  return (
    <div
      style={{
        position: 'absolute',
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: dragging ? 45 : 25
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          background: 'rgba(20,20,20,0.92)',
          border: `2.5px solid ${dragging ? '#e05a4e' : '#B03A2E'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: dragging ? '0 0 0 5px rgba(176,58,46,0.35)' : 'none'
        }}
      >
        <span style={{color: '#fff', fontSize: 15, fontWeight: 'bold'}}>对{ln.order}</span>
      </div>
    </div>
  )
}

function TacticsBoard() {
  const activityId = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])
  const {user, profile} = useAuth()
  const [activity, setActivity] = useState<Activity | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  // 返回页面时保留已渲染内容，不整页重挂（模块级 readyPages 记录首载完成）
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('tactics-board')

  // 绘制状态
  const [viewMode, setViewMode] = useState<'half' | 'full'>('half')
  const [teamName1, setTeamName1] = useState('红队')
  const [teamName2, setTeamName2] = useState('蓝队')
  const [team, setTeam] = useState('红队')
  const [lineKind, setLineKind] = useState<'pass' | 'run' | 'defend'>('pass')
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [note, setNote] = useState('')
  // 战术图片附件
  const [tacticImage, setTacticImage] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  // 战术反馈弹窗
  const [feedbackTacticId, setFeedbackTacticId] = useState<string | null>(null)
  const [feedbackList, setFeedbackList] = useState<TacticFeedback[]>([])
  const [feedbackCounts, setFeedbackCounts] = useState<Record<string, number>>({})
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackImage, setFeedbackImage] = useState<string | null>(null)
  const [feedbackUploading, setFeedbackUploading] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [currentLine, setCurrentLine] = useState<{x: number; y: number}[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [tool, setTool] = useState<Tool>('line')
  const [lineOrder, setLineOrder] = useState(1)
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([])
  const [placingPlayerId, setPlacingPlayerId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // 旗子/对方标记编号与拖动
  const [nextFlagNum, setNextFlagNum] = useState(1)
  const [oppCount, setOppCount] = useState(0)
  const [draggingMarkerIdx, setDraggingMarkerIdx] = useState<number | null>(null)
  const [templateModalVisible, setTemplateModalVisible] = useState(false)

  const pitchRectRef = useRef<{left: number; top: number; width: number; height: number} | null>(null)
  // 球场像素尺寸（供 DOM 线段计算长度与角度）
  const [pitchSize, setPitchSize] = useState<{w: number; h: number}>({w: 0, h: 0})

  const loadData = useCallback(async () => {
    if (!activityId) return
    startRefresh()
    const [act, regs, tacs, lineup] = await Promise.all([
      getActivity(activityId), getRegistrationsWithProfiles(activityId), getTactics(activityId), getLineup(activityId)
    ])
    setActivity(act)
    setRegistrations(regs)
    setTactics(tacs)
    // 教练端角标：统计每条已下发战术的反馈条数（RLS 自动限定为本人相关）
    getTacticFeedbackCounts(tacs.map((t) => t.id)).then(setFeedbackCounts).catch(() => {})

    // 从「阵型」页加载已排布的球员站位，作为主教练排兵布阵的初始阵容（百分比坐标，与阵容页一致）
    if (lineup?.positions?.length) {
      const profMap = new Map<string, any>()
      for (const r of regs) {
        if (r.profiles) profMap.set(r.user_id, r.profiles)
      }
      const seeded = lineup.positions
        .filter((p) => p.user_id)
        .map((p) => {
          const prof = profMap.get(p.user_id as string)
          return {
            id: p.user_id as string,
            x: Math.round(p.x ?? 50),
            y: Math.round(p.y ?? 50),
            label: prof?.nickname || '队员',
            avatar_url: prof?.avatar_url || null
          }
        })
        if (seeded.length) setDraftPlayers(seeded)
    }
    finishRefresh()
  }, [activityId, startRefresh, finishRefresh])

  useDidShow(() => {
    loadData()
  })

  // 是否为教练/队长（有席位或为管理员/发起人）
  const canDraw = useMemo(() => {
    if (!profile || !activity) return false
    if (profile.role === 'admin' || activity.created_by === profile.id) return true
    const myReg = registrations.find((r) => r.user_id === profile.id)
    return myReg?.seat_role === 'coach' || myReg?.seat_role === 'captain'
  }, [profile, activity, registrations])

  const candidates = useMemo(() => {
    const map = new Map<string, Profile & {team: string}>()
    for (const r of registrations) {
      if (r.user_id !== profile?.id && r.profiles) {
        map.set(r.user_id, {...(r.profiles as any), id: r.user_id, team: r.team || ''} as Profile & {team: string})
      }
    }
    return Array.from(map.values())
  }, [registrations, profile])

  // 按分队分组展示指导对象
  const candidateGroups = useMemo(() => {
    const groups = new Map<string, (Profile & {team: string})[]>()
    for (const c of candidates) {
      const key = c.team || '未分队'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return Array.from(groups.entries()).map(([name, members]) => ({name, members}))
  }, [candidates])

  const toggleTeam = (members: (Profile & {team: string})[]) => {
    const ids = members.map((m) => m.id)
    const allSelected = ids.every((id) => targetIds.includes(id))
    setTargetIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))))
  }

  // 针对我的战术
  const myTactics = useMemo(() => tactics.filter((t) => t.target_user_id === user?.id), [tactics, user])

  const teamNames = useMemo(() => {
    const n1 = teamName1.trim() || '红队'
    const n2 = teamName2.trim() || '蓝队'
    return [n1, n2]
  }, [teamName1, teamName2])

  useEffect(() => {
    if (!teamNames.includes(team)) setTeam(teamNames[0])
  }, [teamNames, team])

  // ===== 触摸坐标换算（球场为 DOM 容器，无 Canvas） =====
  // 球场 touch-action:none + 捕获层 catchMove 阻止页面滚动，视口坐标恒定，无需滚动修正
  const measurePitch = useCallback(() => {
    const query = Taro.createSelectorQuery()
    query.select('#tactics-pitch').boundingClientRect((rect: unknown) => {
      if (!rect || typeof rect !== 'object') return
      if (!('left' in rect) || !('top' in rect) || !('width' in rect) || !('height' in rect)) return
      const {left, top, width, height} = rect
      if (typeof left !== 'number' || typeof top !== 'number' || typeof width !== 'number' || typeof height !== 'number') return
      if (width <= 0 || height <= 0) return
      pitchRectRef.current = {left, top, width, height}
      setPitchSize((prev) =>
        Math.abs(prev.w - width) > 1 || Math.abs(prev.h - height) > 1 ? {w: width, h: height} : prev
      )
    }).exec()
  }, [])

  useReady(() => {
    setTimeout(measurePitch, 100)
  })

  const getCanvasPoint = (e: any): {x: number; y: number} | null => {
    const rect = pitchRectRef.current
    if (!rect) return null
    const touch = e.changedTouches?.[0] || e.touches?.[0]
    if (!touch) return null
    const clientX = touch.clientX ?? touch.x
    const clientY = touch.clientY ?? touch.y
    // 百分比坐标 0-100（与阵容页一致）
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
    return {x: Math.round(x), y: Math.round(y)}
  }

  /** 命中已有的旗子/对方标记（可拖动） */
  const hitMarkerIdx = (p: {x: number; y: number}) =>
    draftLines.findIndex(
      (l) => (l.kind === 'flag' || l.kind === 'opp') && Math.hypot(l.points[0].x - p.x, l.points[0].y - p.y) <= 9
    )

  const onTouchStart = (e: any) => {
    if (!canDraw) return
    if (tool === 'player' && e && typeof e.preventDefault === 'function') {
      try { e.preventDefault() } catch {}
    }
    measurePitch()
    const p = getCanvasPoint(e)
    if (!p) return
    if (tool === 'player') {
      if (placingPlayerId) {
        if (draftPlayers.find((dp) => dp.id === placingPlayerId)) {
          Taro.showToast({title: '该球员已在阵型中', icon: 'none'})
          return
        }
        const cand = candidates.find((c) => c.id === placingPlayerId)
        setDraftPlayers((prev) => [
          ...prev,
          {
            id: placingPlayerId,
            x: p.x,
            y: p.y,
            label: cand?.nickname || `#${cand?.jersey_number}` || '队员',
            avatar_url: cand?.avatar_url || null
          }
        ])
        setPlacingPlayerId(null)
        return
      }
      const hit = draftPlayers.find((dp) => Math.hypot(dp.x - p.x, dp.y - p.y) <= 8)
      if (hit) setDraggingId(hit.id)
      return
    }
    if (tool === 'flag') {
      const hit = hitMarkerIdx(p)
      if (hit >= 0) {
        setDraggingMarkerIdx(hit)
        return
      }
      setDraftLines((prev) => [...prev, {kind: 'flag', points: [p], order: nextFlagNum}])
      setNextFlagNum((n) => (n % 9) + 1)
      return
    }
    if (tool === 'opp') {
      const hit = hitMarkerIdx(p)
      if (hit >= 0) {
        setDraggingMarkerIdx(hit)
        return
      }
      setDraftLines((prev) => [...prev, {kind: 'opp', points: [p], order: oppCount + 1}])
      setOppCount((c) => Math.min(c + 1, 9))
      return
    }
    // 画线工具
    setCurrentLine([p])
  }

  const onTouchMove = (e: any) => {
    if (!canDraw) return
    if (e && typeof e.preventDefault === 'function') {
      try { e.preventDefault() } catch {}
    }
    const p = getCanvasPoint(e)
    if (!p) return
    if (draggingMarkerIdx !== null) {
      setDraftLines((prev) =>
        prev.map((l, i) => (i === draggingMarkerIdx ? {...l, points: [p]} : l))
      )
      return
    }
    if (tool === 'player' && draggingId) {
      setDraftPlayers((prev) => prev.map((dp) => (dp.id === draggingId ? {...dp, x: p.x, y: p.y} : dp)))
      return
    }
    if (tool !== 'line' || !currentLine) return
    setCurrentLine((prev) => (prev ? [...prev, p] : prev))
  }

  const onTouchEnd = () => {
    if (!canDraw) return
    if (draggingMarkerIdx !== null) {
      setDraggingMarkerIdx(null)
      return
    }
    if (tool === 'player') {
      setDraggingId(null)
      return
    }
    if (tool !== 'line') return
    if (!currentLine || currentLine.length < 2) {
      setCurrentLine(null)
      return
    }
    setDraftLines((prev) => {
      const fitted = fitStroke(currentLine)
      return [...prev, {kind: lineKind, points: fitted.points, order: lineOrder, curve: fitted.curve}]
    })
    setLineOrder((prev) => Math.min(prev + 1, 9))
    setCurrentLine(null)
  }

  const undoLine = () => setDraftLines((prev) => prev.slice(0, -1))
  const clearDraft = () => {
    setDraftLines([])
    setDraftPlayers([])
    setPlacingPlayerId(null)
    setNextFlagNum(1)
    setOppCount(0)
  }
  const removePlayer = (id: string) => setDraftPlayers((prev) => prev.filter((dp) => dp.id !== id))
  const removeLine = (idx: number) => setDraftLines((prev) => prev.filter((_, i) => i !== idx))
  const updateLineNote = (idx: number, text: string) => {
    setDraftLines((prev) => prev.map((l, i) => (i === idx ? {...l, note: text} : l)))
  }

  /** 战术要素行标签 */
  const lineLabel = (l: DraftLine) => {
    if (l.kind === 'flag') return `我方 ${l.order ?? ''}`
    if (l.kind === 'opp') return `对方 ${l.order ?? ''}`
    const meta = TACTIC_LINE_TYPES.find((t) => t.key === l.kind)
    return `${meta?.label || '战术线'} #${l.order ?? ''}`
  }

  const handleSave = async () => {
    if (saving) return
    if (draftLines.length === 0) {
      Taro.showToast({title: '请先画战术线或放置标记', icon: 'none'})
      return
    }
    if (!targetIds.length) {
      Taro.showToast({title: '请选择指导对象', icon: 'none'})
      return
    }
    setSaving(true)
    try {
      const ok = await createTactic({
        activity_id: activityId,
        target_user_ids: targetIds,
        team,
        view_mode: viewMode,
        lines: draftLines,
        players: draftPlayers,
        note: note.trim(),
        image_url: tacticImage
      })
      if (ok) {
        Taro.showToast({title: `战术已下发${targetIds.length}人`, icon: 'success'})
        setDraftLines([])
        setNote('')
        setTargetIds([])
        setNextFlagNum(1)
        setOppCount(0)
        setTacticImage(null)
        await loadData()
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }

  /** 把已下发的战术导入绘制区，教练调整后可重新下发 */
  const handleResend = (t: Tactic) => {
    setViewMode(t.view_mode)
    // 原分组名不在当前两个分组名中时，把它填入第一个分组名槽位，避免被重置
    const names = [teamName1.trim() || '红队', teamName2.trim() || '蓝队']
    if (t.team && !names.includes(t.team)) setTeamName1(t.team)
    setTeam(t.team || names[0])
    setDraftLines(t.lines || [])
    setDraftPlayers(t.players || [])
    setNote(t.note || '')
    setTacticImage(t.image_url || null)
    setTargetIds([t.target_user_id])
    // 重置编号计数，接续导入的标记编号
    const flags = (t.lines || []).filter((l) => l.kind === 'flag')
    const opps = (t.lines || []).filter((l) => l.kind === 'opp')
    const maxFlag = flags.length > 0 ? Math.max(...flags.map((l) => l.order || 1)) : 0
    setNextFlagNum(maxFlag + 1)
    setOppCount(opps.length)
    Taro.showToast({title: '已导入绘制区，调整后重新下发', icon: 'none'})
    Taro.pageScrollTo({selector: '#draw-section', duration: 300}).catch(() => {})
  }

  const handleConfirm = async (id: string) => {
    Taro.showLoading({title: '确认中…'})
    const ok = await confirmTactic(id)
    Taro.hideLoading()
    Taro.showToast({title: ok ? '已确认收到' : '操作失败', icon: ok ? 'success' : 'none'})
    if (ok) await loadData()
  }

  /** 上传战术图片附件 */
  const handlePickTacticImage = async () => {
    const files = await selectMediaFiles({count: 1, mediaType: ['image'], sourceType: ['album', 'camera']})
    if (!files.length) return
    const file = files[0]
    setUploadingImage(true)
    const res = await uploadToSupabase(file, {bucket: 'tactic_images', userId: user?.id})
    setUploadingImage(false)
    if (res.success && res.data?.path) {
      const url = supabase.storage.from('tactic_images').getPublicUrl(res.data.path).data.publicUrl
      setTacticImage(url)
      Taro.showToast({title: '上传成功', icon: 'success'})
    } else {
      Taro.showToast({title: '上传失败', icon: 'none'})
    }
  }

  /** 打开战术反馈弹窗 */
  const openFeedback = async (tacticId: string) => {
    setFeedbackTacticId(tacticId)
    setFeedbackText('')
    setFeedbackImage(null)
    setFeedbackList([])
    setFeedbackLoading(true)
    const list = await getTacticFeedback(tacticId)
    setFeedbackList(list)
    setFeedbackLoading(false)
  }

  const closeFeedback = () => setFeedbackTacticId(null)

  /** 上传反馈配图 */
  const handlePickFeedbackImage = async () => {
    const files = await selectMediaFiles({count: 1, mediaType: ['image'], sourceType: ['album', 'camera']})
    if (!files.length) return
    const file = files[0]
    setFeedbackUploading(true)
    const res = await uploadToSupabase(file, {bucket: 'tactic_images', userId: user?.id})
    setFeedbackUploading(false)
    if (res.success && res.data?.path) {
      const url = supabase.storage.from('tactic_images').getPublicUrl(res.data.path).data.publicUrl
      setFeedbackImage(url)
      Taro.showToast({title: '上传成功', icon: 'success'})
    } else {
      Taro.showToast({title: '上传失败', icon: 'none'})
    }
  }

  /** 提交反馈 */
  const handleSubmitFeedback = async () => {
    if (!feedbackTacticId) return
    if (!feedbackText.trim() && !feedbackImage) {
      Taro.showToast({title: '请输入反馈内容或上传图片', icon: 'none'})
      return
    }
    setFeedbackSubmitting(true)
    const ok = await addTacticFeedback({tactic_id: feedbackTacticId, content: feedbackText, image_url: feedbackImage})
    setFeedbackSubmitting(false)
    if (ok) {
      Taro.showToast({title: '反馈已提交', icon: 'success'})
      setFeedbackText('')
      setFeedbackImage(null)
      const list = await getTacticFeedback(feedbackTacticId)
      setFeedbackList(list)
    } else {
      Taro.showToast({title: '提交失败', icon: 'none'})
    }
  }

  const handleDelete = async (t: Tactic) => {
    const res = await Taro.showModal({title: '删除战术', content: '确定删除该战术指导吗？'})
    if (!res.confirm) return
    const ok = await deleteTactic(t.id)
    if (ok) {
      Taro.showToast({title: '已删除', icon: 'success'})
      await loadData()
    }
  }

  const handleImportTemplate = (tpl: TacticTemplate) => {
    // 导入视角、分组、战术线/标记、球员棋子
    setViewMode(tpl.view_mode)
    setTeam(tpl.team)
    setDraftLines(tpl.lines)
    setDraftPlayers(tpl.players || [])
    // 重置编号计数
    const flags = (tpl.lines || []).filter((l) => l.kind === 'flag')
    const opps = (tpl.lines || []).filter((l) => l.kind === 'opp')
    const maxFlag = flags.length > 0 ? Math.max(...flags.map((l) => l.order || 1)) : 0
    setNextFlagNum(maxFlag + 1)
    setOppCount(opps.length)
    Taro.showToast({title: `已导入「${tpl.name}」`, icon: 'success'})
  }

  /** 导出当前战术为图片并保存/分享 */
  const handleExportImage = async () => {
    const hasContent = draftLines.length > 0 || draftPlayers.length > 0
    if (!hasContent) {
      Taro.showToast({title: '请先绘制战术', icon: 'none'})
      return
    }
    Taro.showLoading({title: '生成图片中…'})
    try {
      const query = Taro.createSelectorQuery()
      query.select('#tactic-export-canvas').fields({node: true, size: true})
      const res: any = await new Promise((resolve) => query.exec(resolve))
      const canvas = res?.[0]?.node
      if (!canvas) {
        Taro.hideLoading()
        Taro.showToast({title: '画布初始化失败', icon: 'none'})
        return
      }
      const dpr = 2
      const cw = 600
      const ch = 840
      canvas.width = cw * dpr
      canvas.height = ch * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const lineLines = draftLines.filter((l) => l.kind === 'pass' || l.kind === 'run' || l.kind === 'defend')
      const opps = draftLines.filter((l) => l.kind === 'opp')

      drawTacticPoster(ctx, cw, ch, {
        title: activity?.title || '战术指导',
        team,
        viewMode,
        lines: lineLines,
        players: draftPlayers,
        opps
      })

      const tempRes: any = await new Promise((resolve, reject) => {
        Taro.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: cw,
          height: ch,
          destWidth: cw * dpr,
          destHeight: ch * dpr,
          fileType: 'png',
          success: resolve,
          fail: reject
        })
      })
      Taro.hideLoading()
      const filePath = tempRes.tempFilePath
      Taro.showActionSheet({
        itemList: ['预览图片', '保存到相册', '分享给微信好友'],
        success: async (act) => {
          if (act.tapIndex === 0) {
            Taro.previewImage({current: filePath, urls: [filePath]})
          } else if (act.tapIndex === 1) {
            const saveRes = await Taro.saveImageToPhotosAlbum({filePath}).catch(() => null)
            if (saveRes) {
              Taro.showToast({title: '已保存到相册', icon: 'success'})
            } else {
              Taro.showToast({title: '保存失败，请授权相册', icon: 'none'})
            }
          } else if (act.tapIndex === 2) {
            const shareFn = (Taro as any).shareImageMessage || (Taro as any).shareFileMessage
            if (shareFn) {
              shareFn({path: filePath, imageUrl: filePath}).catch(() => {
                Taro.previewImage({current: filePath, urls: [filePath]})
              })
            } else {
              Taro.previewImage({current: filePath, urls: [filePath]})
            }
          }
        }
      })
    } catch (err) {
      Taro.hideLoading()
      console.error('handleExportImage failed:', err)
      Taro.showToast({title: '生成失败', icon: 'none'})
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
    <div className="min-h-screen bg-background flex flex-col pb-8 relative">
      <LogoBg />
      <div className="relative z-10">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">战术板</h1>
        <p className="text-lg text-muted-foreground">一对一赛前指导 · 队员可确认收到</p>
      </div>

      {/* 我收到的战术 */}
      {myTactics.length > 0 ? (
        <div className="px-5 pt-5 flex flex-col gap-3">
          <h3 className="font-heading text-2xl text-foreground">教练给我的指导</h3>
          {myTactics.map((t) => (
            <div key={t.id} className={`bg-card rounded-2xl border-2 p-4 ${t.confirmed ? 'border-primary/40' : 'border-destructive/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar url={undefined} name={t.author?.nickname} size="sm" />
                  <span className="text-lg text-foreground">{t.author?.nickname || '教练'} 的指导</span>
                </div>
                {t.confirmed ? (
                  <span className="px-2 py-0.5 rounded-md bg-primary/15 text-lg text-primary">已确认</span>
                ) : (
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary active:bg-primary/80"
                    onClick={() => handleConfirm(t.id)}
                  >
                    <div className="py-1.5 px-4 text-lg text-primary-foreground">确认收到</div>
                  </button>
                )}
              </div>
              {t.note && <p className="text-lg text-foreground/80 mt-2 leading-relaxed">{t.note}</p>}
              {/* 战术图（教练绘制的线/标记/棋子，队员可见） */}
              {(t.lines || []).length > 0 && (
                <div className="mt-3">
                  <TacticView domId={`tactic-view-${t.id}`} lines={t.lines || []} players={t.players || []} viewMode={t.view_mode} team={t.team} />
                </div>
              )}
              {/* 战术图片附件 */}
              {t.image_url && (
                <div className="mt-3 rounded-xl overflow-hidden border-2 border-border/60" onClick={() => Taro.previewImage({current: t.image_url as string, urls: [t.image_url as string]})}>
                  <Image src={t.image_url as string} mode="widthFix" className="w-full" />
                </div>
              )}
              {/* 各战术线/标记的备注 */}
              {(t.lines || []).filter((l) => l.note).length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {(t.lines || [])
                    .filter((l) => l.note)
                    .map((l, i) => (
                      <p key={i} className="text-base text-foreground/70 leading-relaxed">
                        <span className="text-primary font-medium">{lineLabel(l)}</span>：{l.note}
                      </p>
                    ))}
                </div>
              )}
              {/* 反馈通道 */}
              <button
                type="button"
                className="mt-3 w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 bg-card"
                onClick={() => openFeedback(t.id)}
              >
                <div className="py-2 flex items-center gap-2">
                  <div className="i-mdi-comment-question-outline text-xl text-primary" />
                  <span className="text-lg text-primary">反馈 / 提问</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 pt-5">
          <div className="bg-card rounded-2xl border-2 border-dashed border-border/60 p-6 flex flex-col items-center gap-2">
            <div className="i-mdi-whistle-outline text-5xl text-muted-foreground/40" />
            <p className="text-lg text-muted-foreground text-center">教练还没有给你下发战术指导</p>
            <p className="text-base text-muted-foreground/70 text-center">收到指导后，可在此点击「确认收到」并提交反馈</p>
          </div>
        </div>
      )}

      {/* 教练绘制区 */}
      {canDraw && (
        <div id="draw-section" className="px-5 pt-6 flex flex-col gap-4">
          <h3 className="font-heading text-2xl text-foreground">绘制战术指导</h3>

          {/* 视角 + 分组 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground w-16">视角</span>
              <div className="flex flex-row gap-2 flex-1">
                {VIEW_MODES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={`flex-1 flex items-center justify-center leading-none break-keep rounded-lg border-2 ${viewMode === v.key ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
                    onClick={() => setViewMode(v.key)}
                  >
                    <div className="py-2 text-lg text-foreground">{v.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground w-16">分组</span>
              <div className="flex flex-row gap-2 flex-1">
                <div className={`flex-1 flex flex-col rounded-lg border-2 overflow-hidden ${team === teamNames[0] ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}>
                  <input
                    className="w-full text-lg text-foreground bg-transparent outline-none px-2 py-1 text-center"
                    value={teamName1}
                    maxLength={6}
                    onInput={(e) => {
                      const ev = e as any
                      setTeamName1(ev.detail?.value ?? ev.target?.value ?? '')
                    }}
                  />
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep"
                    onClick={() => setTeam(teamNames[0])}
                  >
                    <span className={`pb-1 text-base ${team === teamNames[0] ? 'text-primary' : 'text-muted-foreground'}`}>
                      {team === teamNames[0] ? '当前绘制' : '点击选择'}
                    </span>
                  </button>
                </div>
                <div className={`flex-1 flex flex-col rounded-lg border-2 overflow-hidden ${team === teamNames[1] ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}>
                  <input
                    className="w-full text-lg text-foreground bg-transparent outline-none px-2 py-1 text-center"
                    value={teamName2}
                    maxLength={6}
                    onInput={(e) => {
                      const ev = e as any
                      setTeamName2(ev.detail?.value ?? ev.target?.value ?? '')
                    }}
                  />
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep"
                    onClick={() => setTeam(teamNames[1])}
                  >
                    <span className={`pb-1 text-base ${team === teamNames[1] ? 'text-primary' : 'text-muted-foreground'}`}>
                      {team === teamNames[1] ? '当前绘制' : '点击选择'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 工具切换：画战术线 / 放球员 / 数字旗子 / 对方球员 */}
          <div className="flex flex-row gap-2">
            {([
              {key: 'line', label: '战术线', icon: 'i-mdi-draw'},
              {key: 'player', label: '放球员', icon: 'i-mdi-account-plus'},
              {key: 'flag', label: '我方', icon: 'i-mdi-account'},
              {key: 'opp', label: '对方', icon: 'i-mdi-account-alert'}
            ] as {key: Tool; label: string; icon: string}[]).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-lg border-2 ${tool === t.key ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
                onClick={() => setTool(t.key)}
              >
                <div className="py-2 flex flex-col items-center gap-0.5">
                  <div className={`${t.icon} text-2xl text-primary`} />
                  <span className="text-base text-foreground">{t.label}</span>
                </div>
              </button>
            ))}
          </div>

          {tool === 'line' ? (
            <>
              {/* 线类型 */}
              <div className="flex flex-row gap-2">
                {TACTIC_LINE_TYPES.filter((t) => t.key === 'pass' || t.key === 'run' || t.key === 'defend').map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`flex-1 flex items-center justify-center leading-none break-keep rounded-lg border-2 ${lineKind === t.key ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
                    onClick={() => setLineKind(t.key)}
                  >
                    <div className="py-2 flex items-center gap-1">
                      <div className={`${t.icon} text-2xl`} style={{color: t.color}} />
                      <span className="text-lg text-foreground">{t.label}</span>
                    </div>
                  </button>
                ))}
              </div>
              {/* 线条形状：手绘后自动优化 */}
              <p className="text-base text-muted-foreground">手绘完成后自动优化为平滑直线或弧线</p>
              {/* 序号（进攻/防守执行顺序 1-9） */}
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground w-16">序号</span>
                <div className="flex flex-row flex-wrap gap-2 flex-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`flex items-center justify-center leading-none break-keep rounded-lg border-2 w-10 ${lineOrder === n ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
                      onClick={() => setLineOrder(n)}
                    >
                      <div className="py-1.5 text-lg text-foreground">{n}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : tool === 'player' ? (
            <>
              {placingPlayerId && (
                <div className="rounded-lg bg-primary/10 border-2 border-primary px-3 py-2 flex items-center gap-2">
                  <div className="i-mdi-gesture-tap text-xl text-primary" />
                  <span className="text-lg text-primary flex-1">点击球场放置该球员</span>
                  <button type="button" onClick={() => setPlacingPlayerId(null)}>
                    <div className="i-mdi-close text-xl text-muted-foreground" />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <span className="text-lg text-muted-foreground">点击球员后放到球场</span>
                <div className="flex flex-row flex-wrap gap-2">
                  {candidates.map((c) => {
                    const placed = draftPlayers.find((dp) => dp.id === c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`flex items-center justify-center leading-none break-keep rounded-lg border-2 ${placingPlayerId === c.id ? 'border-primary bg-primary/10' : placed ? 'border-border/60 bg-muted/40' : 'border-border/60 bg-card'}`}
                        onClick={() => !placed && setPlacingPlayerId(c.id)}
                      >
                        <div className="py-1.5 px-3 text-lg text-foreground">{c.nickname || '队员'}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              {draftPlayers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-lg text-muted-foreground">场上球员（可拖动，点 ✕ 移除）</span>
                  <div className="flex flex-row flex-wrap gap-2">
                    {draftPlayers.map((dp) => (
                      <div key={dp.id} className="flex items-center gap-1 rounded-lg border-2 border-primary/40 bg-primary/10 px-2 py-1">
                        <span className="text-lg text-foreground">{dp.label}</span>
                        <button type="button" onClick={() => removePlayer(dp.id)}>
                          <div className="i-mdi-close-circle text-lg text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : tool === 'flag' ? (
            <div className="rounded-lg border-2 px-3 py-2 flex items-center gap-2" style={{borderColor: '#2E86DE', background: 'rgba(46,134,222,0.12)'}}>
              <div className="i-mdi-account text-xl" style={{color: '#2E86DE'}} />
              <span className="text-lg flex-1" style={{color: '#2E86DE'}}>点击球场放我方队员标记（蓝色，编号自动递增），点已有标记可拖动</span>
            </div>
          ) : (
            <div className="rounded-lg bg-destructive/10 border-2 border-destructive/50 px-3 py-2 flex items-center gap-2">
              <div className="i-mdi-account-alert text-xl text-destructive" />
              <span className="text-lg text-destructive flex-1">点击球场放对方球员标记，点已有标记可拖动</span>
            </div>
          )}

          {/* 球场（CSS 草坪 + DOM 棋子 + DOM 战术线，无 Canvas） */}
          {/* 球场为普通 div + touchAction:none 阻止页面滚动；触摸由末尾的捕获层接收 */}
          <div
            id="tactics-pitch"
            className="relative w-full rounded-2xl overflow-hidden pitch-bg shadow-lg"
            style={{height: '125vw', touchAction: 'none'}}
          >
            {/* 球场标线：中线与中圈 */}
            <div
              className="absolute left-0 right-0 border-b border-white/35"
              style={{top: '50%', transform: 'translateY(-50%)', zIndex: 5}}
            />
            <div
              className="absolute rounded-full border border-white/35"
              style={{left: '50%', top: '50%', width: '80px', height: '80px', transform: 'translate(-50%, -50%)', zIndex: 5}}
            />
            <div
              className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
              style={{left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5}}
            />

            {/* 顶部球门区与禁区 */}
            <div
              className="absolute border-b border-x border-white/35"
              style={{left: '20%', right: '20%', top: 0, height: '16%', zIndex: 5}}
            />
            <div
              className="absolute border-b border-x border-white/35"
              style={{left: '35%', right: '35%', top: 0, height: '7%', zIndex: 5}}
            />
            <div
              className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
              style={{left: '50%', top: '11%', transform: 'translate(-50%, -50%)', zIndex: 5}}
            />

            {/* 底部球门区与禁区 */}
            <div
              className="absolute border-t border-x border-white/35"
              style={{left: '20%', right: '20%', bottom: 0, height: '16%', zIndex: 5}}
            />
            <div
              className="absolute border-t border-x border-white/35"
              style={{left: '35%', right: '35%', bottom: 0, height: '7%', zIndex: 5}}
            />
            <div
              className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
              style={{left: '50%', bottom: '11%', transform: 'translate(-50%, 50%)', zIndex: 5}}
            />

            {/* 战术线（DOM 旋转线段 + 箭头 + 序号徽章） */}
            {draftLines
              .filter((l) => l.points.length >= 2 && l.kind !== 'flag' && l.kind !== 'opp')
              .map((l, i) => (
                <LineLayer key={`ln-${i}`} ln={l} size={pitchSize} />
              ))}
            {currentLine && currentLine.length >= 2 && (
              <LineLayer
                ln={(() => {
                  const fitted = fitStroke(currentLine)
                  return {kind: lineKind, points: fitted.points, order: lineOrder, curve: fitted.curve}
                })()}
                size={pitchSize}
              />
            )}

            {/* 数字旗子 / 对方球员标记 */}
            {draftLines.map((l, i) =>
              l.kind === 'flag' || l.kind === 'opp' ? (
                <MarkerLayer key={`mk-${i}`} ln={l} dragging={draggingMarkerIdx === i} />
              ) : null
            )}

            {/* 球员棋子（DOM absolute，拖动由触摸层统一处理） */}
            {draftPlayers.map((dp) => {
              const isDragging = draggingId === dp.id
              return (
                <div
                  key={dp.id}
                  className="absolute flex flex-col items-center gap-0.5 select-none"
                  style={{
                    left: `${dp.x}%`,
                    top: `${dp.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isDragging ? 40 : 20
                  }}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 relative ${
                      isDragging
                        ? 'scale-125 border-[#C9A227] shadow-gold bg-primary ring-4 ring-[#C9A227]/40'
                        : 'border-[#C9A227] bg-primary/95 shadow-md'
                    }`}
                  >
                    {dp.avatar_url ? (
                      <Image src={dp.avatar_url} mode="aspectFill" className="w-full h-full rounded-full" />
                    ) : (
                      <span className="font-heading text-base text-primary-foreground">{(dp.label || '队').slice(0, 1)}</span>
                    )}
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-xs truncate max-w-[60px] bg-black/60 text-white">
                    {dp.label}
                  </span>
                </div>
              )
            })}

            {/* 最上层捕获层：覆盖整个球场（含标记之上），实际接收触摸；catchMove 阻断页面滚动 */}
            <div
              style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 50}}
              catchMove
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />
          </div>

          <div className="flex flex-row gap-2">
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-card"
              onClick={undoLine}
            >
              <div className="py-2.5 flex items-center gap-1">
                <div className="i-mdi-undo text-2xl text-muted-foreground" />
                <span className="text-lg text-muted-foreground">撤销</span>
              </div>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-card"
              onClick={() => setTemplateModalVisible(true)}
            >
              <div className="py-2.5 flex items-center gap-1">
                <div className="i-mdi-folder-open-outline text-2xl text-primary" />
                <span className="text-lg text-foreground">模板</span>
              </div>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-card"
              onClick={clearDraft}
            >
              <div className="py-2.5 flex items-center gap-1">
                <div className="i-mdi-eraser text-2xl text-muted-foreground" />
                <span className="text-lg text-muted-foreground">清空</span>
              </div>
            </button>
          </div>

          {/* 战术要素列表：每条线/标记可写备注 */}
          {draftLines.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-lg text-muted-foreground">战术要素（可为每条线写备注，随战术一并下发）</span>
              {draftLines.map((l, i) => {
                const meta = TACTIC_LINE_TYPES.find((t) => t.key === l.kind)
                return (
                  <div key={i} className="flex items-center gap-2 bg-card border-2 border-border/60 rounded-xl px-3 py-2">
                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{background: meta?.color || '#fff'}} />
                    <span className="text-lg text-foreground shrink-0">{lineLabel(l)}</span>
                    <div className="flex-1 min-w-0 border-l-2 border-border/50 pl-2">
                      <input
                        className="w-full text-lg text-foreground bg-transparent outline-none"
                        placeholder="备注（如：前插套边）"
                        maxLength={50}
                        value={l.note || ''}
                        onInput={(e) => {
                          const ev = e as any
                          updateLineNote(i, ev.detail?.value ?? ev.target?.value ?? '')
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0"
                      onClick={() => removeLine(i)}
                    >
                      <div className="i-mdi-close text-xl text-destructive" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 指导对象（按分队分组，可整队全选） */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground">指导对象</span>
              {targetIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-base">已选 {targetIds.length} 人</span>
              )}
            </div>
            {candidateGroups.map((g) => {
              const ids = g.members.map((m) => m.id)
              const selectedCount = ids.filter((id) => targetIds.includes(id)).length
              const allSelected = selectedCount === g.members.length
              return (
                <div key={g.name} className="rounded-xl border-2 border-border/60 bg-card p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-base">{g.name}</span>
                      <span className="text-base text-muted-foreground">{g.members.length} 人</span>
                    </div>
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none break-keep rounded-lg border-2 border-primary/40"
                      onClick={() => toggleTeam(g.members)}
                    >
                      <div className="py-1 px-3 text-base text-primary">{allSelected ? '取消全选' : '整队全选'}</div>
                    </button>
                  </div>
                  <div className="flex flex-row flex-wrap gap-2">
                    {g.members.map((c) => {
                      const selected = targetIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`flex items-center justify-center leading-none break-keep rounded-lg border-2 ${selected ? 'border-primary bg-primary/10' : 'border-border/60 bg-background'}`}
                          onClick={() => setTargetIds((prev) => (selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]))}
                        >
                          <div className="py-1.5 px-3 text-lg text-foreground">{c.nickname || '队员'}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 战术图片附件（如纸质草图照片） */}
          <div className="flex flex-col gap-2">
            <span className="text-lg text-muted-foreground">战术图片（可选，如纸上画好后拍照上传）</span>
            {tacticImage ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-border/60">
                <Image src={tacticImage} mode="widthFix" className="w-full" />
                <button
                  type="button"
                  className="absolute top-2 right-2 flex items-center justify-center w-9 h-9 rounded-full bg-black/60"
                  onClick={() => setTacticImage(null)}
                >
                  <div className="i-mdi-close text-xl text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-dashed border-primary/40 bg-card"
                onClick={handlePickTacticImage}
              >
                <div className="py-4 flex items-center gap-2">
                  <div className={`text-2xl text-primary ${uploadingImage ? 'i-mdi-loading animate-spin' : 'i-mdi-camera-plus-outline'}`} />
                  <span className="text-lg text-primary">{uploadingImage ? '上传中…' : '上传战术图片'}</span>
                </div>
              </button>
            )}
          </div>

          {/* 整体备注 */}
          <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="战术总说明（可选）"
              maxLength={200}
              value={note}
              onInput={(e) => {
                const ev = e as any
                setNote(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>

          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
            onClick={handleSave}
          >
            <div className="py-3.5 text-2xl text-primary-foreground">{saving ? '下发中…' : '下发战术指导'}</div>
          </button>

          {/* 导出战术图片分享 */}
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/50 bg-card"
            onClick={handleExportImage}
          >
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-image-multiple-outline text-2xl text-primary" />
              <span className="text-xl text-primary">导出战术图片分享</span>
            </div>
          </button>
        </div>
      )}

      {/* 已下发的战术列表（教练可见） */}
      {canDraw && tactics.length > 0 && (
        <div className="px-5 pt-6 flex flex-col gap-3">
          <h3 className="font-heading text-2xl text-foreground">已下发指导</h3>
          {tactics.map((t) => {
            const target = registrations.find((r) => r.user_id === t.target_user_id)
            const fbCount = feedbackCounts[t.id] || 0
            return (
              <div key={t.id} className="bg-card rounded-2xl border-2 border-border/60 p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar url={undefined} name={target?.profiles?.nickname} size="sm" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg text-foreground truncate">{target?.profiles?.nickname || '队员'}</span>
                      {t.confirmed ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-base text-primary shrink-0">已确认</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md bg-muted text-base text-muted-foreground shrink-0">待确认</span>
                      )}
                    </div>
                    <span className="text-base text-muted-foreground truncate">
                      {t.team} · {new Date(t.created_at).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="relative flex items-center justify-center leading-none break-keep rounded-lg border-2 border-primary/40 bg-card w-9 h-9"
                    onClick={() => openFeedback(t.id)}
                  >
                    <div className="i-mdi-comment-text-multiple-outline text-xl text-primary" />
                    {fbCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-5 px-1 rounded-full bg-destructive text-base text-white text-center leading-5 z-10">
                        {fbCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep rounded-lg border-2 border-primary/40 bg-primary/10 px-3 h-9"
                    onClick={() => handleResend(t)}
                  >
                    <div className="flex items-center gap-1">
                      <div className="i-mdi-repeat text-xl text-primary" />
                      <span className="text-base text-primary">再下发</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep rounded-lg bg-muted w-9 h-9"
                    onClick={() => handleDelete(t)}
                  >
                    <div className="i-mdi-trash-can-outline text-xl text-muted-foreground" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 战术模板弹窗：收藏 / 导入 */}
      <TacticTemplateModal
        visible={templateModalVisible}
        onClose={() => setTemplateModalVisible(false)}
        current={{team, view_mode: viewMode, lines: draftLines, players: draftPlayers}}
        onImport={handleImportTemplate}
      />

      {/* 导出战术图片用的离屏 Canvas（不显示） */}
      <Canvas
        type="2d"
        id="tactic-export-canvas"
        canvasId="tactic-export-canvas"
        style={{position: 'fixed', left: '-9999px', top: 0, width: '600px', height: '840px'}}
      />

      {/* 战术反馈弹窗 */}
      {feedbackTacticId && (() => {
        const fbTactic = tactics.find((t) => t.id === feedbackTacticId)
        const canSubmit = fbTactic?.target_user_id === user?.id
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={closeFeedback}>
            <div
              className="w-full bg-background rounded-t-3xl p-5 flex flex-col"
              style={{maxHeight: '82vh'}}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-heading text-2xl text-foreground">战术反馈</h3>
                <button type="button" className="flex items-center justify-center w-9 h-9 rounded-full bg-muted" onClick={closeFeedback}>
                  <div className="i-mdi-close text-xl text-muted-foreground" />
                </button>
              </div>

              {/* 反馈列表 */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-3">
                {feedbackLoading ? (
                  <p className="text-lg text-muted-foreground text-center py-6">加载中…</p>
                ) : feedbackList.length === 0 ? (
                  <p className="text-lg text-muted-foreground text-center py-6">暂无反馈</p>
                ) : (
                  feedbackList.map((f) => (
                    <div key={f.id} className="bg-card rounded-xl border-2 border-border/60 p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar url={undefined} name={f.user?.nickname} size="sm" />
                        <span className="text-lg text-foreground">{f.user?.nickname || '队员'}</span>
                        <span className="text-base text-muted-foreground ml-auto">{new Date(f.created_at).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                      {f.content && <p className="text-lg text-foreground/85 leading-relaxed">{f.content}</p>}
                      {f.image_url && (
                        <div className="rounded-lg overflow-hidden border-2 border-border/60" onClick={() => Taro.previewImage({current: f.image_url as string, urls: [f.image_url as string]})}>
                          <Image src={f.image_url as string} mode="widthFix" className="w-full" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* 提交反馈（仅战术接收者本人） */}
              {canSubmit && (
                <div className="flex flex-col gap-2 border-t-2 border-border/60 pt-3">
                  <div className="border-2 border-input rounded-lg px-4 py-3 bg-card overflow-hidden">
                    <textarea
                      className="w-full text-lg text-foreground bg-transparent outline-none"
                      style={{height: '72px'}}
                      placeholder="哪里不清楚？写下来告诉教练…"
                      maxLength={300}
                      value={feedbackText}
                      onInput={(e) => {
                        const ev = e as any
                        setFeedbackText(ev.detail?.value ?? ev.target?.value ?? '')
                      }}
                    />
                  </div>
                  {feedbackImage && (
                    <div className="relative rounded-lg overflow-hidden border-2 border-border/60 w-28">
                      <Image src={feedbackImage} mode="aspectFill" className="w-28 h-20" />
                      <button type="button" className="absolute top-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/60" onClick={() => setFeedbackImage(null)}>
                        <div className="i-mdi-close text-base text-white" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-row gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 bg-card"
                      onClick={handlePickFeedbackImage}
                    >
                      <div className="py-2.5 px-4 flex items-center gap-1">
                        <div className={`text-xl text-primary ${feedbackUploading ? 'i-mdi-loading animate-spin' : 'i-mdi-image-plus-outline'}`} />
                        <span className="text-lg text-primary">{feedbackUploading ? '上传中' : '配图'}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${feedbackSubmitting ? 'bg-primary/50' : 'bg-primary'}`}
                      onClick={handleSubmitFeedback}
                    >
                      <div className="py-2.5 text-lg text-primary-foreground">{feedbackSubmitting ? '提交中…' : '提交反馈'}</div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
    </div>
  )
}

export default withRouteGuard(TacticsBoard)
