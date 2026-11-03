import {useEffect, useState} from 'react'
import Taro from '@tarojs/taro'
import {Canvas} from '@tarojs/components'
import {ABILITY_DIMENSIONS, overallAbility, type AbilityCarrier} from '@/constants'

interface Props {
  data?: AbilityCarrier | null
  /** 最大边长。实际尺寸不超过容器宽度，避免被卡片裁切 */
  size?: number
  /** 组件实例 id，页面内多个雷达图需唯一 */
  canvasId?: string
}

interface RadarContext {
  clearRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  stroke(): void
  fill(): void
  arc(x: number, y: number, radius: number, start: number, end: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  fillText(text: string, x: number, y: number): void
  scale(x: number, y: number): void
  strokeStyle: string
  fillStyle: string
  lineWidth: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
}

interface RadarCanvas {
  width: number
  height: number
  getContext(kind: '2d'): RadarContext | null
}

function readCanvas(value: unknown): RadarCanvas | null {
  if (typeof value !== 'object' || value === null || !('node' in value)) return null
  const node = value.node
  if (typeof node !== 'object' || node === null || !('getContext' in node) || typeof node.getContext !== 'function') return null
  return node as RadarCanvas
}

/** 六边形能力雷达图（Canvas 2D）。标注和顶点都画在画布内。 */
export default function RadarChart({data, size = 280, canvasId = 'radar'}: Props) {
  const [edge, setEdge] = useState(0)

  useEffect(() => {
    let cancelled = false
    const measure = (attempt = 0) => {
      Taro.createSelectorQuery()
        .select(`#${canvasId}-box`)
        .boundingClientRect((rect) => {
          if (cancelled) return
          const box = Array.isArray(rect) ? rect[0] : rect
          const width = Math.floor(box?.width || 0)
          if (width < 40) {
            if (attempt < 10) setTimeout(() => measure(attempt + 1), 40)
            return
          }
          setEdge(Math.min(size, width))
        })
        .exec()
    }
    measure()
    return () => {
      cancelled = true
    }
  }, [size, canvasId])

  useEffect(() => {
    if (!edge) return
    let cancelled = false
    const paint = (attempt = 0) => {
      Taro.createSelectorQuery()
        .select(`#${canvasId}`)
        .fields({node: true, size: true})
        .exec((res) => {
          if (cancelled) return
          const canvas = readCanvas(Array.isArray(res) ? res[0] : undefined)
          if (!canvas) {
            if (attempt < 8) setTimeout(() => paint(attempt + 1), 40)
            return
          }
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          const dpr = Taro.getSystemInfoSync().pixelRatio || 2
          canvas.width = edge * dpr
          canvas.height = edge * dpr
          ctx.scale(dpr, dpr)
          draw(ctx, edge, data)
        })
    }
    const timer = setTimeout(() => paint(), 16)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [data, edge, canvasId])

  return (
    <div id={`${canvasId}-box`} className="w-full flex justify-center">
      {edge > 0 ? (
        <Canvas type="2d" id={canvasId} canvasId={canvasId} style={{width: `${edge}px`, height: `${edge}px`}} />
      ) : (
        <div style={{width: '100%', height: `${Math.min(size, 220)}px`}} />
      )}
    </div>
  )
}

function draw(ctx: RadarContext, size: number, data: AbilityCarrier | null | undefined) {
  const n = ABILITY_DIMENSIONS.length
  const labelSize = size < 220 ? 12 : 13
  const valueSize = size < 220 ? 11 : 12
  const sidePad = labelSize * 2 + 12
  const endPad = labelSize + valueSize + 16
  const cx = size / 2
  const cy = size / 2
  const radius = Math.max(28, Math.min(cx - sidePad, cy - endPad))
  const ink = '#2D5016'
  const muted = '#7A6A45'
  const grid = 'rgba(122, 106, 69, 0.22)'

  ctx.clearRect(0, 0, size, size)

  const values = ABILITY_DIMENSIONS.map((d) => {
    const v = data?.[d.key]
    return v === null || v === undefined ? 0 : Math.min(100, Math.max(0, v)) / 100
  })
  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pointAt = (i: number, r: number) => {
    const a = angleOf(i)
    return {x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)}
  }

  for (let layer = 3; layer >= 1; layer--) {
    const r = (radius * layer) / 3
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const p = pointAt(i % n, r)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    if (layer === 3) {
      ctx.fillStyle = 'rgba(250, 247, 239, 0.5)'
      ctx.fill()
    }
    ctx.strokeStyle = grid
    ctx.lineWidth = 1
    ctx.stroke()
  }

  for (let i = 0; i < n; i++) {
    const p = pointAt(i, radius)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = grid
    ctx.lineWidth = 1
    ctx.stroke()
  }

  if (data && overallAbility(data) !== null) {
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const p = pointAt(i % n, Math.max(radius * values[i % n], 2))
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(201, 162, 39, 0.32)'
    ctx.fill()
    ctx.strokeStyle = '#2D5016'
    ctx.lineWidth = 2
    ctx.stroke()
    for (let i = 0; i < n; i++) {
      const p = pointAt(i, Math.max(radius * values[i], 2))
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#C9A227'
      ctx.fill()
      ctx.strokeStyle = '#2D5016'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  for (let i = 0; i < n; i++) {
    const a = angleOf(i)
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const label = ABILITY_DIMENSIONS[i].label
    const raw = data?.[ABILITY_DIMENSIONS[i].key]
    const valueText = raw === null || raw === undefined ? '' : String(raw)
    const anchor = pointAt(i, radius + 6)

    ctx.fillStyle = ink
    ctx.font = `600 ${labelSize}px sans-serif`
    if (Math.abs(cos) < 0.35) {
      ctx.textAlign = 'center'
      if (sin < 0) {
        ctx.textBaseline = 'bottom'
        if (valueText) {
          ctx.fillStyle = muted
          ctx.font = `${valueSize}px sans-serif`
          ctx.fillText(valueText, anchor.x, anchor.y - labelSize - 1)
          ctx.fillStyle = ink
          ctx.font = `600 ${labelSize}px sans-serif`
        }
        ctx.fillText(label, anchor.x, anchor.y)
      } else {
        ctx.textBaseline = 'top'
        ctx.fillText(label, anchor.x, anchor.y)
        if (valueText) {
          ctx.fillStyle = muted
          ctx.font = `${valueSize}px sans-serif`
          ctx.fillText(valueText, anchor.x, anchor.y + labelSize + 2)
        }
      }
      continue
    }

    ctx.textAlign = cos > 0 ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    const labelY = valueText ? anchor.y - 7 : anchor.y
    ctx.fillText(label, anchor.x, labelY)
    if (valueText) {
      ctx.fillStyle = muted
      ctx.font = `${valueSize}px sans-serif`
      ctx.fillText(valueText, anchor.x, anchor.y + 8)
    }
  }
}

