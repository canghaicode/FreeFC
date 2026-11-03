/**
 * 战术图导出工具：在 Canvas 2D 上下文上绘制完整战术图（球场背景 + 线 + 棋子 + 旗标 + 标题）
 * 用于「导出战术图片分享」。
 */
import {TACTIC_LINE_TYPES} from '@/constants'
import type {TacticLine, TacticPlayer} from '@/db/types'

/** 球场宽高比（半场/全场一致，纵向长方形） */
const PITCH_RATIO = 0.68

/** 二次贝塞尔弧线采样（p0 起点、c 控制点、p2 终点），百分比坐标 */
function arcPoints(p0: {x: number; y: number}, c: {x: number; y: number}, p2: {x: number; y: number}, segs = 24): {x: number; y: number}[] {
  const pts: {x: number; y: number}[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y
    pts.push({x, y})
  }
  return pts
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 绘制球场背景（半场或全场） */
function drawPitch(ctx: any, x: number, y: number, w: number, h: number, viewMode: 'half' | 'full') {
  // 草坪底色渐变
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, '#4a8a3a')
  grad.addColorStop(1, '#3d7a30')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)

  // 草纹条纹
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  const stripeCount = 6
  const sw = w / stripeCount
  for (let i = 0; i < stripeCount; i += 2) {
    ctx.fillRect(x + i * sw, y, sw, h)
  }

  // 场地白线
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 2
  // 外框
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12)

  if (viewMode === 'half') {
    // 底线（球门线）
    const goalY = y + h - 6
    // 罚球区
    const boxW = w * 0.5
    const boxH = h * 0.34
    const boxX = x + (w - boxW) / 2
    const boxY = goalY - boxH
    ctx.strokeRect(boxX, boxY, boxW, boxH)
    // 小禁区
    const smW = w * 0.26
    const smH = h * 0.14
    const smX = x + (w - smW) / 2
    const smY = goalY - smH
    ctx.strokeRect(smX, smY, smW, smH)
    // 点球点
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.arc(x + w / 2, goalY - boxH * 0.6, 3, 0, Math.PI * 2)
    ctx.fill()
    // 罚球弧
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(x + w / 2, goalY - boxH * 0.6, w * 0.14, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    // 中线（顶部）
    ctx.beginPath()
    ctx.moveTo(x + 6, y + 6)
    ctx.lineTo(x + w - 6, y + 6)
    ctx.stroke()
  } else {
    // 全场：中线
    const midY = y + h / 2
    ctx.beginPath()
    ctx.moveTo(x + 6, midY)
    ctx.lineTo(x + w - 6, midY)
    ctx.stroke()
    // 中圈
    ctx.beginPath()
    ctx.arc(x + w / 2, midY, w * 0.12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.arc(x + w / 2, midY, 3, 0, Math.PI * 2)
    ctx.fill()
    // 上下罚球区
    const boxW = w * 0.5
    const boxH = h * 0.18
    const boxX = x + (w - boxW) / 2
    ctx.strokeRect(boxX, y + 6, boxW, boxH)
    ctx.strokeRect(boxX, y + h - 6 - boxH, boxW, boxH)
  }
}

/** 绘制一条战术线（直线/弧线 + 箭头 + 序号徽章） */
function drawLine(ctx: any, ln: TacticLine, ox: number, oy: number, w: number, h: number) {
  if (ln.points.length < 2) return
  const meta = TACTIC_LINE_TYPES.find((t) => t.key === ln.kind)
  const color = meta?.color || '#fff'
  const toPx = (pt: {x: number; y: number}) => ({px: ox + (pt.x / 100) * w, py: oy + (pt.y / 100) * h})

  const pts = ln.curve === 'arc' && ln.points.length >= 3 ? arcPoints(ln.points[0], ln.points[1], ln.points[2]) : ln.points

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (ln.kind === 'pass') ctx.setLineDash([10, 6])
  else if (ln.kind === 'defend') ctx.setLineDash([2, 6])
  else ctx.setLineDash([])

  ctx.beginPath()
  const first = toPx(pts[0])
  ctx.moveTo(first.px, first.py)
  for (let i = 1; i < pts.length; i++) {
    const p = toPx(pts[i])
    ctx.lineTo(p.px, p.py)
  }
  ctx.stroke()
  ctx.setLineDash([])

  // 箭头
  const last = toPx(pts[pts.length - 1])
  const prev = toPx(pts[pts.length - 2])
  const ang = Math.atan2(last.py - prev.py, last.px - prev.px)
  const arrowLen = 14
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(last.px, last.py)
  ctx.lineTo(
    last.px - arrowLen * Math.cos(ang - Math.PI / 6),
    last.py - arrowLen * Math.sin(ang - Math.PI / 6)
  )
  ctx.lineTo(
    last.px - arrowLen * Math.cos(ang + Math.PI / 6),
    last.py - arrowLen * Math.sin(ang + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()

  // 序号徽章
  if (ln.order) {
    const sp = toPx(pts[0])
    ctx.fillStyle = '#1a1a1a'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sp.px, sp.py - 16, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(ln.order), sp.px, sp.py - 16)
  }
}

/** 绘制棋子（我方蓝/对方黑红） */
function drawPlayer(ctx: any, p: TacticPlayer, ox: number, oy: number, w: number, h: number, isOpp = false) {
  const px = ox + (p.x / 100) * w
  const py = oy + (p.y / 100) * h
  const r = 16
  ctx.beginPath()
  ctx.arc(px, py, r, 0, Math.PI * 2)
  ctx.fillStyle = isOpp ? '#2b2b2b' : '#2563eb'
  ctx.fill()
  ctx.strokeStyle = isOpp ? '#ef4444' : '#1d4ed8'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((p.label || (isOpp ? '对' : '队')).slice(0, 1), px, py)
}

/**
 * 在给定 Canvas 2D 上下文上绘制完整战术图（含标题、球场、线、棋子、旗标）。
 * canvas 尺寸由调用方设置。
 */
export function drawTacticPoster(
  ctx: any,
  canvasW: number,
  canvasH: number,
  opts: {
    title: string
    team: string
    viewMode: 'half' | 'full'
    lines: TacticLine[]
    players?: TacticPlayer[]
    opps?: TacticLine[]
  }
) {
  const {title, team, viewMode, lines, players = [], opps = []} = opts

  // 背景
  ctx.fillStyle = '#FAF7EF'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // 标题
  ctx.fillStyle = '#2D5016'
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title.slice(0, 16), 24, 44)
  ctx.fillStyle = '#7A6A45'
  ctx.font = '18px sans-serif'
  ctx.fillText(team, 24, 70)

  // 球场区域
  const padX = 24
  const pitchTop = 90
  const pitchBottom = canvasH - 24
  const pitchW = canvasW - padX * 2
  let pitchH = (pitchBottom - pitchTop) * 1
  // 按比例约束球场高度
  const maxH = pitchW / PITCH_RATIO
  if (pitchH > maxH) pitchH = maxH
  const pitchX = padX
  const pitchY = pitchTop + ((pitchBottom - pitchTop) - pitchH) / 2

  drawPitch(ctx, pitchX, pitchY, pitchW, pitchH, viewMode)

  // 线
  for (const ln of lines) drawLine(ctx, ln, pitchX, pitchY, pitchW, pitchH)

  // 我方棋子
  for (const p of players) drawPlayer(ctx, p, pitchX, pitchY, pitchW, pitchH, false)

  // 对方标记
  for (const ln of opps) {
    if (ln.points.length > 0) {
      const pt = ln.points[ln.points.length - 1]
      drawPlayer(ctx, {id: ln.order ? `opp-${ln.order}` : 'opp', x: pt.x, y: pt.y, label: ln.order ? String(ln.order) : '对'}, pitchX, pitchY, pitchW, pitchH, true)
    }
  }

  // 水印
  ctx.fillStyle = 'rgba(45,80,22,0.25)'
  ctx.font = '14px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('成都自由人FC · 战术板', canvasW - 20, canvasH - 12)
}

export {roundRect}